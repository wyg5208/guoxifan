#Requires -RunAsAdministrator
<#
.SYNOPSIS
    每日备份：SQLite 一致性快照 + 媒体增量镜像 + 周日打包（docs/06 §5.2）。

.DESCRIPTION
    由计划任务每天 03:00 调用，也可手动执行。日志追加到 $BackupRoot\backup.log，
    并写入 Windows 应用程序事件日志（来源 VillageBackup）。

.EXAMPLE
    .\backup.ps1
    .\backup.ps1 -DataRoot "D:\village-data" -BackupRoot "E:\village-backup" -KeepDays 30
#>
param(
    [string]$DataRoot   = "D:\village-data",
    [string]$BackupRoot = "E:\village-backup",
    [string]$Python     = "D:\village\venv\Scripts\python.exe",
    [string]$SevenZip   = "C:\Program Files\7-Zip\7z.exe",
    [int]$KeepDays      = 30,
    [int]$KeepWeeks     = 8
)

$ErrorActionPreference = "Stop"
$ts     = Get-Date -Format "yyyyMMdd-HHmm"
$log    = Join-Path $BackupRoot "backup.log"
$dbSrc  = Join-Path $DataRoot "village.db"
$dbDst  = Join-Path $BackupRoot "db\village-$ts.db"

function Write-Log([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding utf8
}

New-Item -ItemType Directory -Force -Path (Join-Path $BackupRoot "db"), (Join-Path $BackupRoot "weekly") | Out-Null

try {
    Write-Log "== 备份开始 $ts"

    # 1) 数据库一致性快照：sqlite backup API 比直接复制文件安全（WAL 模式下尤甚）
    if (-not (Test-Path $dbSrc)) { throw "找不到数据库：$dbSrc" }
    if (-not (Test-Path $Python)) { throw "找不到 Python：$Python" }

    & $Python -c @"
import sqlite3
import sys
src_path, dst_path = sys.argv[1], sys.argv[2]
src = sqlite3.connect(src_path)
dst = sqlite3.connect(dst_path)
src.backup(dst)
dst.close()
src.close()
"@ $dbSrc $dbDst
    if ($LASTEXITCODE -ne 0) { throw "数据库快照失败" }
    Write-Log ("数据库快照 -> {0} ({1:N1} MB)" -f $dbDst, ((Get-Item $dbDst).Length / 1MB))

    # 2) 媒体增量镜像（/MIR 会删除备份盘上源端已不存在的文件，故备份盘请专用）
    $robolog = Join-Path $BackupRoot "robocopy.log"
    foreach ($sub in @("uploads", "derived", "videos", "attachments")) {
        $from = Join-Path $DataRoot $sub
        if (-not (Test-Path $from)) { Write-Log "跳过（不存在）：$from"; continue }
        $to = Join-Path $BackupRoot $sub
        robocopy $from $to /MIR /R:2 /W:5 /NFL /NDL /NP /LOG+:$robolog | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy 失败（$sub）：exit $LASTEXITCODE" }
    }
    Write-Log "媒体镜像完成"

    # 3) 周日整体打包
    if ((Get-Date).DayOfWeek -eq "Sunday" -and (Test-Path $SevenZip)) {
        $archive = Join-Path $BackupRoot "weekly\village-$ts.7z"
        & $SevenZip a -t7z -mx=5 -bd $archive (Join-Path $BackupRoot "db") (Join-Path $BackupRoot "uploads") (Join-Path $BackupRoot "derived") | Out-Null
        Write-Log "周包 -> $archive"
    }

    # 4) 清理过期快照与周包
    Get-ChildItem (Join-Path $BackupRoot "db\village-*.db") |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
        ForEach-Object { Remove-Item $_.FullName -Force; Write-Log "删除旧快照 $($_.Name)" }

    Get-ChildItem (Join-Path $BackupRoot "weekly\village-*.7z*") |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7 * $KeepWeeks) } |
        ForEach-Object { Remove-Item $_.FullName -Force; Write-Log "删除旧周包 $($_.Name)" }

    Write-Log "== 备份完成"
    try {
        if (-not [System.Diagnostics.EventLog]::SourceExists("VillageBackup")) {
            New-EventLog -LogName Application -Source "VillageBackup"
        }
        Write-EventLog -LogName Application -Source "VillageBackup" -EventId 1001 `
            -EntryType Information -Message "village backup ok $ts"
    } catch { Write-Log "写事件日志失败（不影响备份）：$($_.Exception.Message)" }
}
catch {
    Write-Log "!! 备份失败：$($_.Exception.Message)"
    try {
        if (-not [System.Diagnostics.EventLog]::SourceExists("VillageBackup")) {
            New-EventLog -LogName Application -Source "VillageBackup"
        }
        Write-EventLog -LogName Application -Source "VillageBackup" -EventId 1002 `
            -EntryType Error -Message "village backup failed: $($_.Exception.Message)"
    } catch { }
    exit 1
}

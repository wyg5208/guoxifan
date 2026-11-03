#Requires -RunAsAdministrator
<#
.SYNOPSIS
    从备份恢复数据（docs/06 §5.3），也可用于季度恢复演练。

.DESCRIPTION
    1) 停 VillageAPI
    2) 把当前数据库另存为 pre-restore 快照（后悔药）
    3) 用最新备份覆盖 village.db，并清掉 -wal / -shm
    4) robocopy 反向恢复媒体目录
    5) 起服务并自检 /healthz

    演练时加 -DryRun：只打印将要执行的动作，不动任何文件。

.EXAMPLE
    .\restore.ps1 -DryRun
    .\restore.ps1 -Force
    .\restore.ps1 -Snapshot "E:\village-backup\db\village-20261103-0300.db" -Force
#>
param(
    [string]$DataRoot    = "D:\village-data",
    [string]$BackupRoot  = "E:\village-backup",
    [string]$ServiceName = "VillageAPI",
    [string]$Snapshot    = "",
    [switch]$Force,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$dbTarget = Join-Path $DataRoot "village.db"
$log      = Join-Path $BackupRoot "restore.log"

function Write-Log([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
        Add-Content -Path $log -Value $line -Encoding utf8
    }
}

function Invoke-Step([string]$Description, [scriptblock]$Action) {
    if ($DryRun) {
        Write-Log "[dry-run] $Description"
        return
    }
    Write-Log $Description
    & $Action
}

if (-not (Test-Path $DataRoot)) { throw "找不到数据目录：$DataRoot" }

# 选快照：显式指定优先，否则取最新
if (-not $Snapshot) {
    $candidates = Get-ChildItem (Join-Path $BackupRoot "db\village-*.db") -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
    if (-not $candidates) { throw "备份目录里没有快照：$(Join-Path $BackupRoot 'db')" }
    $Snapshot = $candidates[0].FullName
}
if (-not (Test-Path $Snapshot)) { throw "找不到快照：$Snapshot" }
$snapshotInfo = Get-Item $Snapshot
Write-Log ("将使用快照 {0}（{1:yyyy-MM-dd HH:mm}，{2:N1} MB）" -f $snapshotInfo.Name, $snapshotInfo.LastWriteTime, ($snapshotInfo.Length / 1MB))

$mediaDirs = @("uploads", "derived", "videos", "attachments")
$available = $mediaDirs | Where-Object { Test-Path (Join-Path $BackupRoot $_) }
if (-not $available) { Write-Warning "备份盘没有媒体目录，本次只恢复数据库" }

if (-not $Force -and -not $DryRun) {
    Write-Host ""
    Write-Host "这会覆盖 $dbTarget 以及上面的媒体目录。" -ForegroundColor Yellow
    $answer = Read-Host "确认请输入 yes"
    if ($answer -ne "yes") { Write-Host "已取消"; return }
}

$started = Get-Date

try {
    Invoke-Step "停止服务 $ServiceName" {
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -ne "Stopped") {
            Stop-Service $ServiceName -Force
            (Get-Service $ServiceName).WaitForStatus("Stopped", "00:00:60")
        }
    }

    if (-not $DryRun -and (Test-Path $dbTarget)) {
        $keep = Join-Path $BackupRoot ("pre-restore\village-{0}.db" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
        New-Item -ItemType Directory -Force -Path (Split-Path $keep -Parent) | Out-Null
        Copy-Item $dbTarget $keep -Force
        Write-Log "当前库已另存：$keep"
    }

    Invoke-Step "覆盖数据库" {
        Copy-Item $Snapshot $dbTarget -Force
        foreach ($suffix in @("-wal", "-shm")) {
            $side = "$dbTarget$suffix"
            if (Test-Path $side) { Remove-Item $side -Force }
        }
    }

    foreach ($sub in $available) {
        Invoke-Step "恢复媒体 $sub" {
            $from = Join-Path $BackupRoot $sub
            $to   = Join-Path $DataRoot $sub
            New-Item -ItemType Directory -Force -Path $to | Out-Null
            robocopy $from $to /MIR /R:2 /W:5 /NFL /NDL /NP | Out-Null
            if ($LASTEXITCODE -ge 8) { throw "robocopy 失败（$sub）：exit $LASTEXITCODE" }
        }
    }

    Invoke-Step "启动服务 $ServiceName" {
        Start-Service $ServiceName
        Start-Sleep -Seconds 3
    }

    if (-not $DryRun) {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/healthz" -TimeoutSec 15
        Write-Log ("健康检查：{0}" -f ($health | ConvertTo-Json -Compress))
        if ($health.status -ne "ok") { throw "健康检查没通过，请看 logs\api-err.log" }
    }

    Write-Log ("恢复完成，用时 {0:N1} 分钟" -f ((Get-Date) - $started).TotalMinutes)
}
catch {
    Write-Log "!! 恢复失败：$($_.Exception.Message)"
    exit 1
}

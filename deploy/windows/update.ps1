#Requires -RunAsAdministrator
<#
.SYNOPSIS
    一键发布后端（docs/06 §6.2）：拉代码 → 装依赖 → 迁移 → 重启 → 自检。

.DESCRIPTION
    代码目录必须是干净的 git 工作区；脚本会先打一次数据库快照，
    迁移失败时只报警不回滚（数据迁移的回滚请走 restore.ps1）。

.EXAMPLE
    .\update.ps1
    .\update.ps1 -Branch main -SkipBackup
#>
param(
    [string]$AppRoot     = "D:\village\app",
    [string]$Venv        = "D:\village\venv",
    [string]$ServiceName = "VillageAPI",
    [string]$Branch      = "main",
    [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"
$python = Join-Path $Venv "Scripts\python.exe"
$alembic = Join-Path $Venv "Scripts\alembic.exe"

function Assert-Path([string]$Path, [string]$What) {
    if (-not (Test-Path $Path)) { throw "找不到$What：$Path" }
}

Assert-Path $python "Python 虚拟环境"
Assert-Path $alembic "alembic"
Assert-Path (Join-Path $AppRoot ".git") "git 仓库"

Push-Location $AppRoot
try {
    $dirty = git status --porcelain
    if ($dirty) { throw "工作区有未提交改动，先处理掉再发布：`n$dirty" }

    if (-not $SkipBackup) {
        $backupScript = Join-Path $PSScriptRoot "backup.ps1"
        if (Test-Path $backupScript) {
            Write-Host "==> 发布前先备份"
            & $backupScript
            if ($LASTEXITCODE -ne 0) { throw "发布前备份失败，已中止" }
        } else {
            Write-Warning "没找到 backup.ps1，跳过发布前备份"
        }
    }

    Write-Host "==> 拉取 $Branch"
    git fetch --all --prune
    git reset --hard "origin/$Branch"

    Write-Host "==> 安装依赖"
    & $python -m pip install -e api --quiet --disable-pip-version-check
    if ($LASTEXITCODE -ne 0) { throw "pip install 失败" }

    Write-Host "==> 数据库迁移"
    Push-Location (Join-Path $AppRoot "api")
    try {
        & $alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "alembic upgrade 失败，服务保持旧版本" }
    } finally {
        Pop-Location
    }

    Write-Host "==> 重启 $ServiceName"
    Restart-Service $ServiceName
    Start-Sleep -Seconds 4

    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/healthz" -TimeoutSec 15
    if ($health.status -ne "ok") { throw "健康检查失败，请查看 D:\village\logs\api-err.log" }
    Write-Host ("部署完成：{0}" -f ($health | ConvertTo-Json -Compress))
}
finally {
    Pop-Location
}

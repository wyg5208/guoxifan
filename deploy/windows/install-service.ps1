#Requires -RunAsAdministrator
<#
.SYNOPSIS
    把 FastAPI（uvicorn）与 Caddy 注册为 Windows 服务（NSSM）。

.DESCRIPTION
    对应 docs/06-部署与运维方案.md §3.4 / §3.5。脚本幂等：服务已存在时只更新参数。

.EXAMPLE
    .\install-service.ps1
    .\install-service.ps1 -AppRoot "D:\village\app" -SkipCaddy
#>
param(
    [string]$AppRoot   = "D:\village\app",
    [string]$Venv      = "D:\village\venv",
    [string]$DataRoot  = "D:\village-data",
    [string]$LogsDir   = "D:\village\logs",
    [string]$Nssm      = "D:\village\tools\nssm\nssm.exe",
    [string]$ServiceName = "VillageAPI",
    [string]$CaddyExe  = "D:\village\tools\caddy\caddy.exe",
    [string]$Caddyfile = "D:\village\tools\caddy\Caddyfile",
    [switch]$SkipCaddy
)

$ErrorActionPreference = "Stop"

function Assert-Path([string]$Path, [string]$What) {
    if (-not (Test-Path $Path)) { throw "找不到$What：$Path" }
}

Assert-Path $Nssm "NSSM"
Assert-Path (Join-Path $Venv "Scripts\python.exe") "Python 虚拟环境"
Assert-Path (Join-Path $AppRoot "api\app\main.py") "后端代码"

New-Item -ItemType Directory -Force -Path $LogsDir, $DataRoot | Out-Null

$python  = Join-Path $Venv "Scripts\python.exe"
$appDir  = Join-Path $AppRoot "api"
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($null -eq $service) {
    Write-Host "==> 安装服务 $ServiceName"
    & $Nssm install $ServiceName $python `
        "-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1 --no-server-header"
} else {
    Write-Host "==> 服务 $ServiceName 已存在，更新配置"
    & $Nssm set $ServiceName Application $python
    & $Nssm set $ServiceName AppParameters `
        "-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1 --no-server-header"
}

& $Nssm set $ServiceName AppDirectory $appDir
& $Nssm set $ServiceName AppEnvironmentExtra "APP_ENV=production"
& $Nssm set $ServiceName AppStdout (Join-Path $LogsDir "api-out.log")
& $Nssm set $ServiceName AppStderr (Join-Path $LogsDir "api-err.log")
& $Nssm set $ServiceName AppRotateFiles 1
& $Nssm set $ServiceName AppRotateOnline 1
& $Nssm set $ServiceName AppRotateBytes 10485760
& $Nssm set $ServiceName AppExit Default Restart
& $Nssm set $ServiceName AppRestartDelay 5000
# 崩溃时别无限狂重启
& $Nssm set $ServiceName AppThrottle 10000
& $Nssm set $ServiceName Start SERVICE_AUTO_START
& $Nssm set $ServiceName DisplayName "Village API (过溪畈)"
& $Nssm set $ServiceName Description "过溪畈老村记忆站后端：FastAPI + WebSocket"

if ((Get-Service -Name $ServiceName).Status -ne "Running") { Start-Service $ServiceName }
Start-Sleep -Seconds 2

if (-not $SkipCaddy) {
    Assert-Path $CaddyExe "Caddy"
    Assert-Path $Caddyfile "Caddyfile"

    Write-Host "==> 校验 Caddyfile"
    & $CaddyExe validate --config $Caddyfile
    if ($LASTEXITCODE -ne 0) { throw "Caddyfile 校验不通过" }

    $caddySvc = Get-Service -Name "Caddy" -ErrorAction SilentlyContinue
    if ($null -eq $caddySvc) {
        Write-Host "==> 安装服务 Caddy"
        & $Nssm install Caddy $CaddyExe "run --config `"$Caddyfile`""
        & $Nssm set Caddy AppDirectory (Split-Path $Caddyfile -Parent)
        & $Nssm set Caddy AppStdout (Join-Path $LogsDir "caddy-out.log")
        & $Nssm set Caddy AppStderr (Join-Path $LogsDir "caddy-err.log")
        & $Nssm set Caddy Start SERVICE_AUTO_START
    }
    if ((Get-Service -Name "Caddy").Status -ne "Running") { Start-Service Caddy }
}

Write-Host "==> 自检"
foreach ($target in @("http://127.0.0.1:8000/healthz")) {
    try {
        $response = Invoke-WebRequest -Uri $target -UseBasicParsing -TimeoutSec 10
        Write-Host ("    {0} -> {1}" -f $target, $response.Content)
    } catch {
        Write-Warning ("    {0} 暂无响应：{1}" -f $target, $_.Exception.Message)
    }
}

Write-Host ""
Write-Host "完成。常用命令："
Write-Host "  nssm restart $ServiceName      # 改完代码或 .env 后重启"
Write-Host "  nssm stop $ServiceName         # 停止"
Write-Host "  Get-Content $LogsDir\api-err.log -Tail 50 -Wait"

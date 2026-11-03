#Requires -RunAsAdministrator
<#
.SYNOPSIS
    存活巡检（docs/06 §6.3）：请求 /healthz，连续失败 3 次自动重启服务。

.DESCRIPTION
    由计划任务每 5 分钟调用一次（见 deploy\README.md）。失败次数记在
    $StateFile 里，重启成功或一次成功即清零。健康页返回的 disk_free_gb
    低于阈值时写警告到日志，不触发重启。

.EXAMPLE
    .\healthcheck.ps1
    .\healthcheck.ps1 -DiskWarnGb 30 -FailureThreshold 3
#>
param(
    [string]$Url              = "http://127.0.0.1:8000/healthz",
    [string]$ServiceName      = "VillageAPI",
    [string]$LogsDir          = "D:\village\logs",
    [string]$StateFile        = "D:\village\logs\healthcheck.state",
    [int]$FailureThreshold    = 3,
    [double]$DiskWarnGb       = 20
)

$ErrorActionPreference = "Stop"
$log = Join-Path $LogsDir "healthcheck.log"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

function Write-Log([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $log -Value $line -Encoding utf8
    Write-Host $line
}

$failures = 0
if (Test-Path $StateFile) {
    $raw = (Get-Content $StateFile -Raw).Trim()
    if ($raw -match '^\d+$') { $failures = [int]$raw }
}

try {
    $health = Invoke-RestMethod -Uri $Url -TimeoutSec 10
    if ($health.status -ne "ok") { throw "status=$($health.status)" }

    Set-Content -Path $StateFile -Value 0 -Encoding ascii

    if ($health.disk_free_gb -and [double]$health.disk_free_gb -lt $DiskWarnGb) {
        Write-Log ("警告：磁盘剩余 {0} GB，低于 {1} GB" -f $health.disk_free_gb, $DiskWarnGb)
    }
    exit 0
}
catch {
    $failures++
    Set-Content -Path $StateFile -Value $failures -Encoding ascii
    Write-Log ("健康检查失败（第 {0} 次）：{1}" -f $failures, $_.Exception.Message)

    if ($failures -ge $FailureThreshold) {
        try {
            Write-Log "连续失败达阈值，重启 $ServiceName"
            Restart-Service $ServiceName -Force
            Start-Sleep -Seconds 5
            $again = Invoke-RestMethod -Uri $Url -TimeoutSec 10
            if ($again.status -eq "ok") {
                Set-Content -Path $StateFile -Value 0 -Encoding ascii
                Write-Log "重启后恢复正常"
                exit 0
            }
            throw "重启后仍不健康"
        }
        catch {
            Write-Log ("重启无效：{0}（请检查 logs\api-err.log）" -f $_.Exception.Message)
            exit 1
        }
    }
    exit 1
}

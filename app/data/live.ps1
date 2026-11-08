# Live CPU/RAM sampler: prints one JSON line about every second until the process is killed.
# Uses WMI performance classes (locale independent, unlike Get-Counter paths).
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
while ($true) {
    $p = @(Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation)
    $os = Get-CimInstance Win32_OperatingSystem
    $cores = @($p | Where-Object { $_.Name -notmatch '_Total' } | ForEach-Object { [ordered]@{ n = $_.Name; u = [int]$_.PercentProcessorUtility; f = [int]$_.ProcessorFrequency } })
    $tot = $p | Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1
    $o = [ordered]@{ cores = $cores; total = [int]$tot.PercentProcessorUtility; mhz = [int]$tot.ProcessorFrequency
        ramFreeKb = [int64]$os.FreePhysicalMemory; ramTotalKb = [int64]$os.TotalVisibleMemorySize }
    Write-Output ($o | ConvertTo-Json -Depth 4 -Compress)
    Start-Sleep -Milliseconds 700
}

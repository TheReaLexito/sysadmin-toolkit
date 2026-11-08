$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$os=Get-WmiObject Win32_OperatingSystem
$cs=Get-WmiObject Win32_ComputerSystem
"OS|"+$os.Caption+" "+$os.OSArchitecture+" (сборка "+$os.BuildNumber+")"
$boot=[Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime)
"UPTIME_H|"+[math]::Round(((Get-Date)-$boot).TotalHours,1)
"PC|"+$cs.Manufacturer+" "+$cs.Model+" / "+$env:COMPUTERNAME
"SERIAL|"+(Get-WmiObject Win32_BIOS).SerialNumber
foreach($c in Get-WmiObject Win32_Processor){"CPU|"+$c.Name.Trim()+" ("+$c.NumberOfCores+" ядер)|"+$c.LoadPercentage}
"RAM_TOTAL_MB|"+[math]::Round($cs.TotalPhysicalMemory/1MB)
"RAM_FREE_MB|"+[math]::Round($os.FreePhysicalMemory/1KB)
foreach($m in Get-WmiObject Win32_PhysicalMemory){"RAM_MOD|"+[math]::Round($m.Capacity/1GB)+" ГБ, "+$m.Speed+" МГц, "+$m.Manufacturer}
foreach($d in Get-WmiObject Win32_DiskDrive){"DISK|"+$d.Model+"|"+[math]::Round($d.Size/1GB)+"|"+$d.Status}
foreach($l in Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3"){"VOL|"+$l.DeviceID+"|"+[math]::Round($l.Size/1GB,1)+"|"+[math]::Round($l.FreeSpace/1GB,1)}
foreach($s in Get-WmiObject -Namespace root\wmi -Class MSStorageDriver_FailurePredictStatus){"SMART_FAIL|"+$s.PredictFailure}
foreach($t in Get-WmiObject -Namespace root\wmi -Class MSAcpi_ThermalZoneTemperature){"TEMP|"+[math]::Round($t.CurrentTemperature/10-273.15,1)}
foreach($v in Get-WmiObject Win32_VideoController){"GPU|"+$v.Name}
foreach($b in Get-WmiObject Win32_Battery){"BATT|"+$b.EstimatedChargeRemaining}
$ev=@(Get-EventLog -LogName System -EntryType Error -Newest 300 | Where-Object {$_.TimeGenerated -gt (Get-Date).AddDays(-7)})
"ERR7D|"+$ev.Count
foreach($e in ($ev|Select-Object -First 5)){"ERR|"+$e.TimeGenerated.ToString('yyyy-MM-dd HH:mm')+" "+$e.Source+" #"+($e.EventID -band 65535)}
foreach($p in Get-WmiObject Win32_PnPEntity | Where-Object {$_.ConfigManagerErrorCode -ne 0}){"DEVERR|"+$p.Name+"|"+$p.ConfigManagerErrorCode}
$md=@(Get-ChildItem "$env:windir\Minidump\*.dmp" | Where-Object {$_.LastWriteTime -gt (Get-Date).AddDays(-30)})
"BSOD30|"+$md.Count
foreach($b in (Get-WinEvent -FilterHashtable @{LogName='System';Id=1001} -MaxEvents 20 | Where-Object {$_.ProviderName -like '*WER-SystemErrorReporting*'} | Select-Object -First 3)){$m=[regex]::Match($b.Message,'0x[0-9a-fA-F]{8}');"BSOD|"+$b.TimeCreated.ToString('yyyy-MM-dd HH:mm')+" код "+$m.Value}
$fc=(Get-WmiObject -Namespace root\wmi -Class BatteryFullChargedCapacity | Select-Object -First 1).FullChargedCapacity
$dc=(Get-WmiObject -Namespace root\wmi -Class BatteryStaticData | Select-Object -First 1).DesignedCapacity
if($fc -and $dc){"BATTWEAR|"+$fc+"|"+$dc}
$lic=Get-WmiObject -Query "SELECT Name,LicenseStatus FROM SoftwareLicensingProduct WHERE PartialProductKey IS NOT NULL AND ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f'" | Select-Object -First 1
if($lic){"LIC|"+$lic.LicenseStatus+"|"+$lic.Name}
$apps=@('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*') | ForEach-Object {Get-ItemProperty $_} | Where-Object {$_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName} | Sort-Object DisplayName -Unique
"APPS|"+$apps.Count
foreach($a in $apps){"APP|"+$a.DisplayName+"|"+$a.DisplayVersion}

param([string]$Part = 'core')
# Detailed hardware/system data for the drill-down view (CPU-Z style). Prints ONE line of JSON.
# Parts: core (cpu, board, memory, gpu, disks, os, network, battery), drivers, events.
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Iso($d) { if ($d) { try { return ([datetime]$d).ToString('s') } catch { return $null } } return $null }
function Str($a) { if ($a) { -join ($a | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) } }

$out = [ordered]@{}

if ($Part -eq 'core') {
    $out.cpu = @(Get-CimInstance Win32_Processor | ForEach-Object {
        [ordered]@{ name = ([string]$_.Name).Trim(); vendor = $_.Manufacturer; cores = $_.NumberOfCores; threads = $_.NumberOfLogicalProcessors
            maxMhz = $_.MaxClockSpeed; curMhz = $_.CurrentClockSpeed; busMhz = $_.ExtClock; l2kb = $_.L2CacheSize; l3kb = $_.L3CacheSize
            socket = $_.SocketDesignation; arch = $_.Architecture; desc = $_.Description; id = $_.ProcessorId
            virt = $_.VirtualizationFirmwareEnabled; slat = $_.SecondLevelAddressTranslationExtensions; addr = $_.AddressWidth }
    })

    $bb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
    $bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
    $cs = Get-CimInstance Win32_ComputerSystem | Select-Object -First 1
    $csp = Get-CimInstance Win32_ComputerSystemProduct | Select-Object -First 1
    $enc = Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1
    $fw = $null
    try {
        Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool GetFirmwareType(ref uint t);' -Name FW -Namespace STK -ErrorAction Stop
        $ft = [uint32]0
        if ([STK.FW]::GetFirmwareType([ref]$ft)) { $fw = [int]$ft }     # 1 = BIOS (Legacy), 2 = UEFI
    } catch { $fw = $null }
    $sb = $null; try { $sb = Confirm-SecureBootUEFI -ErrorAction Stop } catch { $sb = $null }
    $tpm = Get-CimInstance -Namespace 'root\cimv2\Security\MicrosoftTpm' -ClassName Win32_Tpm | Select-Object -First 1
    $out.board = [ordered]@{ boardVendor = $bb.Manufacturer; boardModel = $bb.Product; boardVersion = $bb.Version; boardSerial = $bb.SerialNumber
        biosVendor = $bios.Manufacturer; biosVersion = $bios.SMBIOSBIOSVersion; biosDate = (Iso $bios.ReleaseDate)
        smbios = ('{0}.{1}' -f $bios.SMBIOSMajorVersion, $bios.SMBIOSMinorVersion); firmware = $fw; secureBoot = $sb
        tpm = $(if ($tpm) { $tpm.SpecVersion } else { $null }); tpmReady = $(if ($tpm) { $tpm.IsEnabled_InitialValue } else { $null })
        sysVendor = $cs.Manufacturer; sysModel = $cs.Model; sysType = $cs.SystemType; uuid = $csp.UUID; chassis = $enc.ChassisTypes
        hypervisor = $cs.HypervisorPresent }

    $os = Get-CimInstance Win32_OperatingSystem | Select-Object -First 1
    $cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $tz = Get-TimeZone
    $out.os = [ordered]@{ caption = $os.Caption; version = $os.Version; build = $os.BuildNumber; ubr = $cv.UBR; display = $cv.DisplayVersion
        edition = $cv.EditionID; arch = $os.OSArchitecture; installed = (Iso $os.InstallDate); boot = (Iso $os.LastBootUpTime)
        user = $os.RegisteredUser; productId = $cv.ProductId; locale = $os.Locale; lang = $os.OSLanguage; tz = $tz.DisplayName
        pc = $cs.Name; domain = $cs.Domain; partOfDomain = $cs.PartOfDomain; procCount = $cs.NumberOfProcessors; winDir = $os.WindowsDirectory
        ramTotalKb = [int64]$os.TotalVisibleMemorySize; ramFreeKb = [int64]$os.FreePhysicalMemory
        virtTotalKb = [int64]$os.TotalVirtualMemorySize; virtFreeKb = [int64]$os.FreeVirtualMemory }

    $out.memArray = Get-CimInstance Win32_PhysicalMemoryArray | Select-Object -First 1 | ForEach-Object {
        [ordered]@{ slots = $_.MemoryDevices; maxKb = [int64]$_.MaxCapacity; maxKbEx = [int64]$_.MaxCapacityEx; ecc = $_.MemoryErrorCorrection } }
    $out.mem = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
        [ordered]@{ slot = $_.DeviceLocator; bank = $_.BankLabel; cap = [int64]$_.Capacity; speed = $_.Speed; cfgSpeed = $_.ConfiguredClockSpeed
            vendor = $_.Manufacturer; part = ([string]$_.PartNumber).Trim(); serial = $_.SerialNumber; type = $_.SMBIOSMemoryType; form = $_.FormFactor
            volt = $_.ConfiguredVoltage; vmin = $_.MinVoltage; vmax = $_.MaxVoltage; dataW = $_.DataWidth; totalW = $_.TotalWidth }
    })
    $out.pagefile = @(Get-CimInstance Win32_PageFileUsage | ForEach-Object {
        [ordered]@{ name = $_.Name; allocMb = $_.AllocatedBaseSize; usedMb = $_.CurrentUsage; peakMb = $_.PeakUsage } })

    $vram = @{}
    $cls = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
    Get-ChildItem $cls | ForEach-Object { $p = Get-ItemProperty $_.PSPath; if ($p.DriverDesc) { $q = $p.'HardwareInformation.qwMemorySize'; if ($q) { $vram[[string]$p.DriverDesc] = [int64]$q } } }
    $out.gpu = @(Get-CimInstance Win32_VideoController | ForEach-Object {
        $vr = $vram[[string]$_.Name]
        [ordered]@{ name = $_.Name; vendor = $_.AdapterCompatibility; vram = $(if ($vr) { $vr } else { [int64]$_.AdapterRAM }); vramExact = [bool]$vr
            driver = $_.DriverVersion; driverDate = (Iso $_.DriverDate); proc = $_.VideoProcessor; w = $_.CurrentHorizontalResolution; h = $_.CurrentVerticalResolution
            hz = $_.CurrentRefreshRate; bpp = $_.CurrentBitsPerPixel; status = $_.Status; pnp = $_.PNPDeviceID }
    })
    $bp = @{}
    Get-CimInstance -Namespace root\wmi WmiMonitorBasicDisplayParams | ForEach-Object { $bp[[string]$_.InstanceName] = $_ }
    $out.monitors = @(Get-CimInstance -Namespace root\wmi WmiMonitorID | ForEach-Object {
        $b = $bp[[string]$_.InstanceName]
        [ordered]@{ name = (Str $_.UserFriendlyName); vendor = (Str $_.ManufacturerName); serial = (Str $_.SerialNumberID); product = (Str $_.ProductCodeID)
            year = $_.YearOfManufacture; week = $_.WeekOfManufacture; wcm = $b.MaxHorizontalImageSize; hcm = $b.MaxVerticalImageSize }
    })

    # диски
    $dd = @(Get-CimInstance Win32_DiskDrive)
    $fpd = @(Get-CimInstance -Namespace root\wmi MSStorageDriver_FailurePredictData)
    $fpt = @(Get-CimInstance -Namespace root\wmi MSStorageDriver_FailurePredictThresholds)
    $fps = @(Get-CimInstance -Namespace root\wmi MSStorageDriver_FailurePredictStatus)
    $partMap = @{}
    # буква раздела -> номер физического диска (работает и без прав администратора)
    Get-CimInstance Win32_LogicalDiskToPartition | ForEach-Object {
        $pid2 = [string]$_.Antecedent.DeviceID
        if ($pid2 -match 'Disk #(\d+)') { $partMap[[string]$_.Dependent.DeviceID] = [int]$Matches[1] }
    }
    $out.disks = @(Get-PhysicalDisk | ForEach-Object {
        $pd = $_
        $rc = $pd | Get-StorageReliabilityCounter
        $d = $dd | Where-Object { [string]$_.Index -eq [string]$pd.DeviceId } | Select-Object -First 1
        $gd = Get-Disk -Number ([int]$pd.DeviceId)
        $smart = @()
        if ($d) {
            $pre = ([string]$d.PNPDeviceID).ToLower()
            $x = $fpd | Where-Object { ([string]$_.InstanceName).ToLower().StartsWith($pre) } | Select-Object -First 1
            if ($x) {
                $t = $fpt | Where-Object { $_.InstanceName -eq $x.InstanceName } | Select-Object -First 1
                $vs = $x.VendorSpecific; $tv = $t.VendorSpecific
                for ($i = 2; $i -lt 362; $i += 12) {
                    $id = [int]$vs[$i]; if ($id -eq 0) { continue }
                    $raw = [uint64]0
                    for ($k = 5; $k -ge 0; $k--) { $raw = $raw * 256 + [uint64]$vs[$i + 5 + $k] }
                    $smart += [ordered]@{ id = $id; cur = [int]$vs[$i + 3]; worst = [int]$vs[$i + 4]; thr = $(if ($tv) { [int]$tv[$i + 1] } else { $null }); raw = [string]$raw }
                }
            }
        }
        $pf = $null
        if ($d) { $ps = $fps | Where-Object { ([string]$_.InstanceName).ToLower().StartsWith(([string]$d.PNPDeviceID).ToLower()) } | Select-Object -First 1; if ($ps) { $pf = $ps.PredictFailure } }
        [ordered]@{ num = [int]$pd.DeviceId; model = $pd.FriendlyName; serial = ([string]$pd.SerialNumber).Trim(); fw = $pd.FirmwareVersion
            bus = [string]$pd.BusType; media = [string]$pd.MediaType; size = [int64]$pd.Size; health = [string]$pd.HealthStatus; oper = ([string]$pd.OperationalStatus)
            style = [string]$gd.PartitionStyle; iface = $d.InterfaceType
            temp = $rc.Temperature; tempMax = $rc.TemperatureMax; wear = $rc.Wear; hours = $rc.PowerOnHours; readErr = $rc.ReadErrorsTotal; writeErr = $rc.WriteErrorsTotal
            cycles = $rc.StartStopCycleCount; predictFail = $pf; smart = $smart }
    })
    $out.vols = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
        [ordered]@{ letter = $_.DeviceID; label = $_.VolumeName; fs = $_.FileSystem; size = [int64]$_.Size; free = [int64]$_.FreeSpace; disk = $partMap[[string]$_.DeviceID] } })

    $cfg = @{}
    Get-CimInstance Win32_NetworkAdapterConfiguration | ForEach-Object { $cfg[[int]$_.InterfaceIndex] = $_ }
    $out.nics = @(Get-NetAdapter | ForEach-Object {
        $c = $cfg[[int]$_.ifIndex]
        [ordered]@{ name = $_.Name; desc = $_.InterfaceDescription; status = [string]$_.Status; speed = $_.LinkSpeed; mac = $_.MacAddress; physical = $_.HardwareInterface
            ip = @($c.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' }); gw = @($c.DefaultIPGateway); dns = @($c.DNSServerSearchOrder); dhcp = $c.DHCPEnabled }
    })

    $b = Get-CimInstance Win32_Battery | Select-Object -First 1
    if ($b) {
        $sd = Get-CimInstance -Namespace root\wmi BatteryStaticData | Select-Object -First 1
        $fc = Get-CimInstance -Namespace root\wmi BatteryFullChargedCapacity | Select-Object -First 1
        $cy = Get-CimInstance -Namespace root\wmi BatteryCycleCount | Select-Object -First 1
        $out.battery = [ordered]@{ name = $b.Name; charge = $b.EstimatedChargeRemaining; status = $b.BatteryStatus; runtime = $b.EstimatedRunTime; chem = $b.Chemistry
            designCap = $sd.DesignedCapacity; fullCap = $fc.FullChargedCapacity; cycles = $cy.CycleCount; vendor = $sd.ManufactureName; serial = $sd.SerialNumber }
    } else { $out.battery = $null }
}

if ($Part -eq 'drivers') {
    $out.problems = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 } | ForEach-Object {
        [ordered]@{ name = $_.Name; code = $_.ConfigManagerErrorCode; id = $_.PNPDeviceID; vendor = $_.Manufacturer } })
    $out.drivers = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName } | Sort-Object DeviceClass, DeviceName | ForEach-Object {
        [ordered]@{ name = $_.DeviceName; vendor = $_.Manufacturer; ver = $_.DriverVersion; date = (Iso $_.DriverDate); cls = $_.DeviceClass; signed = $_.IsSigned } })
}

if ($Part -eq 'events') {
    $since = (Get-Date).AddDays(-7)
    $out.events = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1, 2; StartTime = $since } -MaxEvents 150 | ForEach-Object {
        $m = [string]$_.Message
        if ($m) { $m = ($m -replace '\s+', ' '); if ($m.Length -gt 260) { $m = $m.Substring(0, 260) + '...' } }
        [ordered]@{ time = $_.TimeCreated.ToString('s'); src = $_.ProviderName; id = $_.Id; level = $_.LevelDisplayName; msg = $m } })
    $out.dumps = @(Get-ChildItem "$env:windir\Minidump\*.dmp" | Sort-Object LastWriteTime -Descending | ForEach-Object {
        [ordered]@{ name = $_.Name; time = $_.LastWriteTime.ToString('s'); size = $_.Length } })
    $out.crashes = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 1001 } -MaxEvents 40 | Where-Object { $_.ProviderName -like '*WER-SystemErrorReporting*' } | ForEach-Object {
        $mm = [regex]::Match([string]$_.Message, '0x[0-9a-fA-F]{8}')
        [ordered]@{ time = $_.TimeCreated.ToString('s'); code = $mm.Value } })
    $out.unexpected = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 41 } -MaxEvents 15 | ForEach-Object {
        [ordered]@{ time = $_.TimeCreated.ToString('s'); src = $_.ProviderName } })
}

Write-Output ($out | ConvertTo-Json -Depth 7 -Compress)

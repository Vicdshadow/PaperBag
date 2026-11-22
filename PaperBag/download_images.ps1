$images = @(
    @{Name="washing_machine.jpg"; Keyword="washing,machine"},
    @{Name="blender.jpg"; Keyword="blender,kitchen"},
    @{Name="air_conditioner.jpg"; Keyword="air,conditioner"},
    @{Name="iron_heater.jpg"; Keyword="iron,electric"},
    @{Name="gps_navigation.jpg"; Keyword="gps,navigation"},
    @{Name="reverse_camera.jpg"; Keyword="camera,car"},
    @{Name="car_charger.jpg"; Keyword="charger,car"},
    @{Name="dash_cam.jpg"; Keyword="dashcam"},
    @{Name="tv_stand.jpg"; Keyword="tv,stand"},
    @{Name="power_generator.jpg"; Keyword="generator,power"},
    @{Name="extension_box.jpg"; Keyword="extension,cord"},
    @{Name="keyboard_mouse.jpg"; Keyword="keyboard,mouse"},
    @{Name="storage_device.jpg"; Keyword="harddrive,disk"},
    @{Name="led_bulb.jpg"; Keyword="led,bulb"},
    @{Name="flood_light.jpg"; Keyword="floodlight"},
    @{Name="street_light.jpg"; Keyword="streetlight"},
    @{Name="phone_replacement_part.jpg"; Keyword="smartphone,parts"},
    @{Name="inverter_component.jpg"; Keyword="circuit,board"}
)

$destDir = "assets\images"
if (!(Test-Path $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
}

foreach ($img in $images) {
    $name = $img.Name
    $keyword = $img.Keyword
    $outPath = Join-Path $destDir $name
    
    if (-not (Test-Path $outPath)) {
        Write-Host "Downloading $name..."
        $url = "https://loremflickr.com/600/400/$keyword"
        try {
            Invoke-WebRequest -Uri $url -OutFile $outPath -ErrorAction Stop
        } catch {
            Write-Warning "Failed to download $name. Error: $_"
        }
        Start-Sleep -Seconds 1
    } else {
        Write-Host "$name already exists. Skipping."
    }
}

# Fix typo
$typoPath = Join-Path $destDir "powe_banks.jpg"
if (Test-Path $typoPath) {
    $correctPath = Join-Path $destDir "power_banks.jpg"
    if (-not (Test-Path $correctPath)) {
        Write-Host "Renaming typo..."
        Rename-Item -Path $typoPath -NewName "power_banks.jpg"
    } else {
        Remove-Item -Path $typoPath
    }
}

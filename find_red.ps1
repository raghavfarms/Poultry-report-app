Add-Type -AssemblyName System.Drawing
$src = "C:/Users/KBM/.gemini/antigravity/brain/2948f876-4e4c-47cf-9b0e-d45afd87d065/.user_uploaded/media_1792579865874_8f99ade0.jpg"
$bmp = [System.Drawing.Bitmap]::FromFile($src)

Write-Host "Searching for red pixels in the vertical centerline..."
# Center X is around 370-380
$redYs = @()
for ($y = 0; $y -lt $bmp.Height; $y += 5) {
    for ($x = 360; $x -lt 400; $x += 2) {
        $p = $bmp.GetPixel($x, $y)
        # Red liquid: high R, low G, low B
        if ($p.R -gt 150 -and $p.G -lt 80 -and $p.B -lt 80) {
            $redYs += $y
            break
        }
    }
}

if ($redYs.Count -gt 0) {
    Write-Host "Red pixels found from Y =" ($redYs | Measure-Object -Minimum).Minimum "to Y =" ($redYs | Measure-Object -Maximum).Maximum
} else {
    Write-Host "No red pixels detected"
}

$bmp.Dispose()

# Draws every Ledger icon from the app/icon.svg geometry (64x64 viewBox):
# an emerald rounded tile, an "L" stroke and a brass coin.
# Outputs the web icons and the Android launcher / splash images.
# Run from frontend/:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-icons.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $root "android/app/src/main/res"

function New-LedgerBitmap {
  param(
    [int]$Size,
    [switch]$NoTile,      # transparent background (adaptive foreground)
    [double]$Scale = 1,   # glyph scale, used to keep it inside the safe zone
    [switch]$Circle       # round the tile into a circle (round launcher icon)
  )

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $u = $Size / 64.0

  if (-not $NoTile) {
    $rect = New-Object System.Drawing.RectangleF 0, 0, $Size, $Size
    if ($Circle) {
      $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml("#17795f")), ([System.Drawing.ColorTranslator]::FromHtml("#093528")), 45
      $g.FillEllipse($brush, $rect)
    } else {
      $r = 15 * $u
      $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml("#17795f")), ([System.Drawing.ColorTranslator]::FromHtml("#093528")), 45
      $path = New-Object System.Drawing.Drawing2D.GraphicsPath
      $path.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
      $path.AddArc($Size - 2 * $r, 0, 2 * $r, 2 * $r, 270, 90)
      $path.AddArc($Size - 2 * $r, $Size - 2 * $r, 2 * $r, 2 * $r, 0, 90)
      $path.AddArc(0, $Size - 2 * $r, 2 * $r, 2 * $r, 90, 90)
      $path.CloseFigure()
      $g.FillPath($brush, $path)
    }
  }

  # the group sits at translate(-2 2) and is scaled around the centre
  $g.TranslateTransform($Size / 2, $Size / 2)
  $g.ScaleTransform($Scale, $Scale)
  $g.TranslateTransform(-$Size / 2, -$Size / 2)
  $g.TranslateTransform(-2 * $u, 2 * $u)

  $cream = [System.Drawing.ColorTranslator]::FromHtml("#f7f1e1")
  $pen = New-Object System.Drawing.Pen $cream, (7 * $u)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  # M22 14 V43 a3 3 0 0 0 3 3 H46
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddLine(22 * $u, 14 * $u, 22 * $u, 43 * $u)
  $path.AddArc(22 * $u, 40 * $u, 6 * $u, 6 * $u, 180, 90)
  $path.AddLine(25 * $u, 46 * $u, 46 * $u, 46 * $u)
  $g.DrawPath($pen, $path)

  $coin = [System.Drawing.ColorTranslator]::FromHtml("#dca847")
  $coinBrush = New-Object System.Drawing.SolidBrush $coin
  $g.FillEllipse($coinBrush, (43 - 6.5) * $u, (22 - 6.5) * $u, 13 * $u, 13 * $u)

  $g.Dispose()
  return $bmp
}

function Save-Png {
  param([System.Drawing.Bitmap]$Bitmap, [string]$Path)
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "wrote $Path"
}

# --- web icons -------------------------------------------------------------
$icon16 = Join-Path $root "app/_icon16.png"
$icon32 = Join-Path $root "app/_icon32.png"
$icon48 = Join-Path $root "app/_icon48.png"
Save-Png (New-LedgerBitmap 16) $icon16
Save-Png (New-LedgerBitmap 32) $icon32
Save-Png (New-LedgerBitmap 48) $icon48

# pack the three sizes into app/favicon.ico
& (Join-Path $PSScriptRoot "make-favicon.ps1")
Remove-Item $icon16, $icon32, $icon48

# apple touch icon: square, no rounded corners
Save-Png (New-LedgerBitmap 180) (Join-Path $root "app/apple-icon.png")
Save-Png (New-LedgerBitmap 192) (Join-Path $root "public/icon-192.png")
Save-Png (New-LedgerBitmap 512) (Join-Path $root "public/icon-512.png")
# maskable: the glyph shrinks so the platform mask never crops it
Save-Png (New-LedgerBitmap 512 -Scale 0.8) (Join-Path $root "public/icon-maskable-512.png")

# --- Android launcher icons ------------------------------------------------
# legacys: 48dp square and round; foreground: 108dp canvas, glyph at 78%
$densities = @{
  "mdpi"    = @{ Legacy = 48; Foreground = 108; Splash = @{ Port = @(320, 480); Land = @(480, 320) } }
  "hdpi"    = @{ Legacy = 72; Foreground = 162; Splash = @{ Port = @(480, 800); Land = @(800, 480) } }
  "xhdpi"   = @{ Legacy = 96; Foreground = 216; Splash = @{ Port = @(720, 1280); Land = @(1280, 720) } }
  "xxhdpi"  = @{ Legacy = 144; Foreground = 324; Splash = @{ Port = @(960, 1600); Land = @(1600, 960) } }
  "xxxhdpi" = @{ Legacy = 192; Foreground = 432; Splash = @{ Port = @(1280, 1920); Land = @(1920, 1280) } }
}

foreach ($density in $densities.Keys) {
  $d = $densities[$density]
  $folder = Join-Path $res "mipmap-$density"
  Save-Png (New-LedgerBitmap $d.Legacy) (Join-Path $folder "ic_launcher.png")
  Save-Png (New-LedgerBitmap $d.Legacy -Circle) (Join-Path $folder "ic_launcher_round.png")
  Save-Png (New-LedgerBitmap $d.Foreground -NoTile -Scale 0.78) (Join-Path $folder "ic_launcher_foreground.png")
}

# --- splashes: emerald background, mark at 30% of the short side -----------
function New-Splash {
  param([int]$Width, [int]$Height)
  $bmp = New-Object System.Drawing.Bitmap $Width, $Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml("#0D4A3A"))
  $mark = [int](([Math]::Min($Width, $Height)) * 0.30)
  $tile = New-LedgerBitmap $mark
  $g.DrawImage($tile, [int](($Width - $mark) / 2), [int](($Height - $mark) / 2), $mark, $mark)
  $g.Dispose()
  return $bmp
}

foreach ($density in $densities.Keys) {
  $d = $densities[$density]
  Save-Png (New-Splash $d.Splash.Port[0] $d.Splash.Port[1]) (Join-Path $res "drawable-port-$density/splash.png")
  Save-Png (New-Splash $d.Splash.Land[0] $d.Splash.Land[1]) (Join-Path $res "drawable-land-$density/splash.png")
}
Save-Png (New-Splash 480 320) (Join-Path $res "drawable/splash.png")

Write-Output "canvas size 108dp at 78% for the adaptive foreground; background colour is #0D4A3A"

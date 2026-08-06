param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeWindow {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
'@

$process = Get-Process -Id $ProcessId
$handle = $process.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { throw "Electron window not found." }

$rect = New-Object NativeWindow+RECT
if (-not [NativeWindow]::GetWindowRect($handle, [ref]$rect)) { throw "Could not read Electron window bounds." }

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
$image = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($image)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $image.Size)
$image.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$graphics.Dispose()
$image.Dispose()

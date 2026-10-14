#!/usr/bin/env bash
#
# LiteClip - FFmpeg Sidecar 二进制获取脚本
#
# Tauri 的 sidecar 二进制必须按 `<name>-<target-triple>[.exe]` 命名，
# 打包时 Tauri 会自动挑选当前平台对应的那份并嵌入应用。
#
# 本脚本会从公开的静态构建源下载 ffmpeg / ffprobe 到 src-tauri/binaries/。
# 如果网络受限，请参考文末的手动方式，把静态二进制放到相同位置。
#
# 用法：
#   bash scripts/setup-ffmpeg.sh
#   bash scripts/setup-ffmpeg.sh --force          # 已存在则覆盖
#   bash scripts/setup-ffmpeg.sh --platform win   # 交叉准备 Windows 平台二进制

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT_DIR/src-tauri/binaries"
mkdir -p "$BIN_DIR"

FORCE=0
PLATFORM="auto"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

detect_triple() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin)
      case "$arch" in
        arm64) echo "aarch64-apple-darwin" ;;
        x86_64) echo "x86_64-apple-darwin" ;;
        *) echo "unsupported-mac-$arch"; exit 1 ;;
      esac
      ;;
    Linux)
      case "$arch" in
        x86_64) echo "x86_64-unknown-linux-gnu" ;;
        aarch64) echo "aarch64-unknown-linux-gnu" ;;
        *) echo "unsupported-linux-$arch"; exit 1 ;;
      esac
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "x86_64-pc-windows-msvc"
      ;;
    *) echo "unsupported-os-$os"; exit 1 ;;
  esac
}

if [[ "$PLATFORM" == "auto" ]]; then
  TRIPLE="$(detect_triple)"
elif [[ "$PLATFORM" == "mac-arm" ]]; then
  TRIPLE="aarch64-apple-darwin"
elif [[ "$PLATFORM" == "mac-x64" ]]; then
  TRIPLE="x86_64-apple-darwin"
elif [[ "$PLATFORM" == "win" ]]; then
  TRIPLE="x86_64-pc-windows-msvc"
elif [[ "$PLATFORM" == "linux" ]]; then
  TRIPLE="x86_64-unknown-linux-gnu"
else
  echo "unknown platform: $PLATFORM" >&2; exit 2
fi

SUFFIX=""
[[ "$TRIPLE" == *windows* ]] && SUFFIX=".exe"

echo "==> Target triple: $TRIPLE"
echo "==> Binaries dir : $BIN_DIR"

TARGET_FFMPEG="$BIN_DIR/ffmpeg-$TRIPLE$SUFFIX"
TARGET_FFPROBE="$BIN_DIR/ffprobe-$TRIPLE$SUFFIX"

need() {
  local f="$1"
  # 软链接不算“已就绪”（往往指向动态构建的系统 ffmpeg，不能作为 sidecar）
  if [[ -L "$f" ]]; then
    echo "  ⚠ 发现软链接，将重新下载真实静态二进制: $(basename "$f")"
    rm -f "$f"
    return 0
  fi
  if [[ -x "$f" && "$FORCE" != "1" ]]; then
    echo "  ✓ 已存在: $(basename "$f")"
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# 下载源（静态构建，均为社区广泛使用的镜像；如需自托管请替换 URL）
#
# 注：macOS 自带 bash 3.2 不支持关联数组，故使用 case 语句。
# ---------------------------------------------------------------------------
url_for() {
  # $1 = ffmpeg | ffprobe, $2 = triple
  local kind="$1" triple="$2"
  case "$triple" in
    aarch64-apple-darwin)
      if [[ "$kind" == "ffmpeg" ]]; then echo "https://www.osxexperts.net/ffmpeg7arm.zip"
      else echo "https://www.osxexperts.net/ffprobe7arm.zip"; fi
      ;;
    x86_64-apple-darwin)
      if [[ "$kind" == "ffmpeg" ]]; then echo "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"
      else echo "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip"; fi
      ;;
    x86_64-pc-windows-msvc)
      echo "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
      ;;
    x86_64-unknown-linux-gnu)
      echo "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
      ;;
    aarch64-unknown-linux-gnu)
      echo "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"
      ;;
    *)
      echo ""
      ;;
  esac
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch() {
  local url="$1" out="$2"
  echo "  ↓ $url"
  if command -v curl >/dev/null; then
    curl -fsSL "$url" -o "$out"
  elif command -v wget >/dev/null; then
    wget -q "$url" -O "$out"
  else
    echo "需要 curl 或 wget" >&2; exit 1
  fi
}

extract_bin() {
  local archive="$1" want="$2" dest="$3"
  local edir="$TMP/x"
  mkdir -p "$edir"
  case "$archive" in
    *.zip) (cd "$edir" && unzip -qo "$archive") ;;
    *.tar.xz) tar -xf "$archive" -C "$edir" ;;
    *.tar.gz|*.tgz) tar -xzf "$archive" -C "$edir" ;;
    *) echo "unsupported archive: $archive" >&2; exit 1 ;;
  esac
  local found
  found="$(find "$edir" -type f -name "$want*" | head -n1)"
  if [[ -z "$found" ]]; then
    echo "在压缩包中未找到 $want" >&2; exit 1
  fi
  cp "$found" "$dest"
  chmod +x "$dest"
  echo "  ✓ $(basename "$dest")"
}

if need "$TARGET_FFMPEG"; then
  url="$(url_for ffmpeg "$TRIPLE")"
  if [[ -z "$url" ]]; then
    echo "!! 该平台没有内置下载源，请手动放置：$TARGET_FFMPEG"
  else
    ext="${url##*.}"
    arc="$TMP/ffmpeg.$ext"
    fetch "$url" "$arc"
    extract_bin "$arc" "ffmpeg" "$TARGET_FFMPEG"
  fi
fi

if need "$TARGET_FFPROBE"; then
  url="$(url_for ffprobe "$TRIPLE")"
  if [[ -z "$url" ]]; then
    echo "!! 该平台没有内置下载源，请手动放置：$TARGET_FFPROBE"
  else
    ext="${url##*.}"
    arc="$TMP/ffprobe.$ext"
    fetch "$url" "$arc"
    extract_bin "$arc" "ffprobe" "$TARGET_FFPROBE"
  fi
fi

echo
echo "==> 完成。当前 sidecar 目录："
ls -la "$BIN_DIR"

cat <<EOF

—— 手动方式（无网络时）———————————————————————————————
从下列任一渠道下载 **静态**（不依赖 dylib/dll）构建：
  * macOS:  https://evermeet.cx/ffmpeg/  | https://www.osxexperts.net/
  * Windows: https://www.gyan.dev/ffmpeg/builds/  | https://www.btbN.org/FFmpeg-Builds/
  * Linux:  https://johnvansickle.com/ffmpeg/

然后把 ffmpeg / ffprobe 二进制分别重命名为：
  src-tauri/binaries/ffmpeg-$TRIPLE$SUFFIX
  src-tauri/binaries/ffprobe-$TRIPLE$SUFFIX

⚠️  注意：macOS 用户如果通过 Homebrew/conda 安装的 ffmpeg（动态链接），
    不能直接作为 sidecar 使用（会因找不到 dylib 而崩溃）。
    请务必使用静态构建。
EOF

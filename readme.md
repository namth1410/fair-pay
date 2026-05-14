# Fair Pay

Ứng dụng chia tiền nhóm cho React Native (Expo 55) + Supabase + Zustand + HeroUI Native.

Chi tiết kiến trúc, quy ước, và quy tắc dự án: xem [CLAUDE.md](CLAUDE.md).

## Phát triển

```powershell
npm start             # Expo dev server
npx jest              # Chạy tests (85 test cases)
npx tsc --noEmit      # Type check
npm run lint          # ESLint check
```

## Build Android AAB (Play Console)

Dự án dùng **bare workflow** — thư mục `android/` đã commit vào repo với cấu hình signing custom (xem [CLAUDE.md § Android build & signing](CLAUDE.md)). Build local trực tiếp, KHÔNG dùng EAS.

### Prerequisite (lần đầu setup)

1. Cài 4 property vào `~/.gradle/gradle.properties` (global, ngoài repo):

   ```properties
   FAIRPAY_KEYSTORE_PATH=C:/path/to/fairpay.keystore
   FAIRPAY_KEYSTORE_PASSWORD=<password>
   FAIRPAY_KEY_ALIAS=<alias>
   FAIRPAY_KEY_PASSWORD=<password>
   ```

2. Đảm bảo có JDK 17 + Android SDK + biến môi trường `ANDROID_HOME`.

### Bump version trước mỗi lần upload Play Console

Sửa **trực tiếp** [android/app/build.gradle](android/app/build.gradle) (KHÔNG sửa `app.json` vì bare workflow):

```gradle
defaultConfig {
    versionCode 2          // ← tăng mỗi lần upload (1 → 2 → 3 → ...)
    versionName "1.0.0"    // ← có thể giữ nguyên hoặc bump tùy release
}
```

Play Console reject nếu `versionCode` trùng với bản đã upload trước đó.

### Lệnh build AAB

**PowerShell (Windows):**

```powershell
cd android; .\gradlew.bat clean bundleRelease
```

**Bash (Git Bash / WSL / Mac / Linux):**

```bash
cd android && ./gradlew clean bundleRelease
```

`clean` để xóa cache build cũ — bỏ qua nếu chỉ muốn rebuild nhanh.

Output:

```
android/app/build/outputs/bundle/release/app-release.aab
```

Upload file `.aab` này lên Google Play Console → Production → Create new release.

## Prebuild (regenerate native code)

Chỉ chạy khi sửa native config trong `app.json` — ví dụ: thêm/xóa plugin Expo, đổi permission text, đổi `icon`/`splash`/`adaptiveIcon`, đổi `android.package` / `ios.bundleIdentifier`, thêm intent filter / URL scheme. **KHÔNG cần prebuild khi chỉ sửa code JS/TS.**

### Lệnh prebuild

**Mặc định (merge — KHUYẾN NGHỊ):**

```powershell
npx expo prebuild --platform android
```

Prebuild sẽ **merge** thay đổi vào `android/` đang có, cố gắng giữ file user-modified. Tuy nhiên với file đã bị Expo "claim" (như `app/build.gradle`), nó vẫn có thể **overwrite** block `signingConfigs` + `buildTypes` → phải kiểm tra lại sau khi chạy (xem [bước 3](#3-verify--restore-cấu-hình-signing) bên dưới).

**Clean (chỉ khi thật sự cần):**

```powershell
npx expo prebuild --platform android --clean
```

⚠️ `--clean` **XÓA TOÀN BỘ** thư mục `android/` rồi generate lại từ đầu → mất 100% cấu hình signing custom + `versionCode` hiện tại. Chỉ dùng khi merge bị conflict không sửa được hoặc native config đang ở trạng thái lỗi không khắc phục được.

### Quy trình đầy đủ sau prebuild

#### 1. Chạy prebuild

```powershell
npx expo prebuild --platform android
```

#### 2. Verify & restore cấu hình signing

Mở [android/app/build.gradle](android/app/build.gradle) check 2 block:

**Block `signingConfigs` (dòng ~100):** PHẢI có `fairpay` đọc từ global gradle properties:

```gradle
signingConfigs {
    fairpay {
        if (project.hasProperty('FAIRPAY_KEYSTORE_PATH')) {
            storeFile file(FAIRPAY_KEYSTORE_PATH)
            storePassword FAIRPAY_KEYSTORE_PASSWORD
            keyAlias FAIRPAY_KEY_ALIAS
            keyPassword FAIRPAY_KEY_PASSWORD
        } else {
            throw new GradleException(
                'Thiếu FAIRPAY_KEYSTORE_PATH trong ~/.gradle/gradle.properties. ' +
                'Xem hướng dẫn setup keystore trong CLAUDE.md.'
            )
        }
    }
}
```

**Block `buildTypes` (dòng ~118):** CẢ `debug` + `release` phải `signingConfig signingConfigs.fairpay`:

```gradle
buildTypes {
    debug {
        signingConfig signingConfigs.fairpay
    }
    release {
        signingConfig signingConfigs.fairpay
        // ... shrinkResources / minifyEnabled / proguardFiles / crunchPngs giữ nguyên
    }
}
```

Nếu thấy template Expo mặc định (debug xài `debug.keystore`, release thiếu signing) → restore lại đúng 2 block trên. Nhờ Claude check + sửa: *"prebuild xong, restore signing config trong android/app/build.gradle"*.

#### 3. Bump `versionCode`

Prebuild đọc `app.json` để regen `defaultConfig`:

```gradle
defaultConfig {
    versionCode 1          // ← prebuild reset về 1 nếu app.json không có android.versionCode
    versionName "1.0.0"
}
```

Vì `app.json` không khai `android.versionCode`, sau prebuild giá trị có thể bị reset. Sửa thẳng về số đang cần upload (cao hơn mọi bản đã upload Play Console).

#### 4. Build AAB

Quay lại [§ Lệnh build AAB](#lệnh-build-aab) ở trên.

### Tip: tránh cần `--clean`

- Khi sửa `app.json`, prebuild merge thường đủ. Chạy thử trước khi nghĩ tới `--clean`.
- Sau prebuild, nếu chỉ `signingConfigs`/`buildTypes` bị overwrite → restore tay 30 giây, KHÔNG cần `--clean`.
- Commit `android/` sau khi restore + bump version → lần sau diff `git status` sẽ phát hiện ngay nếu prebuild làm hỏng config.

### Kiểm tra AAB sau khi build

Xem `versionCode` / `versionName` / SHA-1 ký:

```powershell
# Cần Android SDK build-tools trong PATH
bundletool dump manifest --bundle=android\app\build\outputs\bundle\release\app-release.aab | Select-String -Pattern "versionCode|versionName"

# SHA-1 của keystore (so với fingerprint trên Google Cloud Console OAuth)
keytool -list -v -keystore <FAIRPAY_KEYSTORE_PATH> -alias <FAIRPAY_KEY_ALIAS>
```

## Khác

- Privacy policy / Xóa tài khoản: https://namth1410.github.io/fairpay-privacy/delete-account.html

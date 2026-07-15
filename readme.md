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

Dự án dùng **bare workflow** với cấu hình signing custom (xem [CLAUDE.md § Android build & signing](CLAUDE.md)). Build local trực tiếp, KHÔNG dùng EAS.

> ⚠️ **`android/` bị GITIGNORE — KHÔNG commit vào repo** (`.gitignore` dòng 50). Thư mục này do `expo prebuild` sinh ra từ `app.json`.
> - **Fresh clone / máy mới PHẢI chạy `npx expo prebuild --platform android` trước khi build** (xem [§ Prebuild](#prebuild-regenerate-native-code)).
> - **Không có lưới git cho `android/`** → không `git diff` để bắt prebuild làm hỏng config. Signing `fairpay`, `versionCode`, dòng `firebase-analytics` phải **tự verify + restore sau mỗi prebuild** (kể cả merge, không chỉ `--clean`).
> - Widget màn hình chính (`react-native-android-widget`) cũng do prebuild sinh từ plugin trong `app.json` + entry `index.js` → không có file native nào phải commit tay (xem [§ Android widget](#android-widget-lối-tắt-tới-chuyến-đi)).

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

## Build Android APK (sideload / test nhanh)

Dùng khi cần file `.apk` để chia sẻ trực tiếp (gửi tester qua link, sideload máy thật) — KHÔNG upload Play Console.

### APK release (ký bằng keystore `fairpay`)

**PowerShell (Windows):**

```powershell
cd android; .\gradlew.bat clean assembleRelease
```

**Bash (Git Bash / WSL / Mac / Linux):**

```bash
cd android && ./gradlew clean assembleRelease
```

Output:

```
android/app/build/outputs/apk/release/app-release.apk
```

APK đã ký bằng keystore master (cùng SHA-1 với AAB) → Google Sign-In / FCM hoạt động bình thường.

### APK debug (dev build, không minify)

```powershell
cd android; .\gradlew.bat assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`. Cũng được ký bằng keystore `fairpay` (theo `signingConfigs` trong [android/app/build.gradle](android/app/build.gradle)) → install đè trực tiếp APK release/debug không cần uninstall.

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
- `android/` **gitignore** nên KHÔNG commit được → không có `git diff`/`git status` để bắt lỗi prebuild. Sau khi restore + bump version, tự verify lại `signingConfigs` / `buildTypes` / `versionCode` / `firebase-analytics` bằng mắt (hoặc build thử). Cân nhắc giữ 1 bản copy `android/app/build.gradle` đã-work ngoài repo để đối chiếu nhanh.

### Kiểm tra AAB sau khi build

Xem `versionCode` / `versionName` / SHA-1 ký:

```powershell
# Cần Android SDK build-tools trong PATH
bundletool dump manifest --bundle=android\app\build\outputs\bundle\release\app-release.aab | Select-String -Pattern "versionCode|versionName"

# SHA-1 của keystore (so với fingerprint trên Google Cloud Console OAuth)
keytool -list -v -keystore <FAIRPAY_KEYSTORE_PATH> -alias <FAIRPAY_KEY_ALIAS>
```

## Android widget (lối tắt tới chuyến đi)

Widget màn hình chính cho phép ghim 1 chuyến đi: hiện tên trip · tên nhóm · số dư của bạn, tap để mở thẳng trip. Thả được nhiều widget, mỗi cái trỏ 1 trip tùy chọn (màn cấu hình khi thả).

- **Thư viện:** [`react-native-android-widget`](https://saleksovski.github.io/react-native-android-widget/) (Android-only), pin exact trong `package.json`.
- **Code JS/TS (commit):** `src/widgets/` (layout `TripWidget`, task handler, config screen, snapshot builder, bridge) + entry `index.js` (đăng ký task handler + config screen ở AppRegistry). `main` trong `package.json` trỏ `./index.js` (KHÔNG còn `expo-router/entry` trực tiếp — file này import lại nó).
- **Native (KHÔNG commit — prebuild sinh):** plugin `react-native-android-widget` trong `app.json` sinh `<receiver>`/`<activity>`/`<service>` trong `AndroidManifest`, `res/xml/widgetprovider_trip.xml`, và `java/.../widget/Trip.java` + `WidgetConfigurationActivity.java` khi chạy `expo prebuild`. **Không cần restore tay** (khác signing/analytics) — plugin tự sinh lại mỗi prebuild.
- **Cầu nối data:** app ghi 1 file JSON (`documentDirectory/widget_state.json`, qua `expo-file-system`) chứa `widgetId → tripId` + snapshot; widget đọc lại khi render (headless). App push cập nhật sau mỗi sync + khi vào foreground.
- **Deep link:** tap widget bắn `fairpay://trips/<id>`. Để deep-link NGOÀI vào màn sâu có nút back, `src/app/(main)/_layout.tsx` khai `unstable_settings.initialRouteName = '(tabs)'` (neo home dưới stack).
- **Fresh clone:** phải `npx expo prebuild --platform android` để có native widget trước khi build.
- ⚠️ iOS chưa hỗ trợ (WidgetKit riêng).

## Khác

- Privacy policy: https://namth1410.github.io/fairpay-legal/privacy-policy.html
- Xóa tài khoản: https://namth1410.github.io/fairpay-legal/delete-account.html

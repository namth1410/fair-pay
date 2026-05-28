// Stub thay thế cho expo-symbols qua metro.config.js resolveRequest.
// App KHÔNG dùng expo-router NativeTabs (chỉ Stack/Slot/Link), nhưng expo-router
// require expo-symbols ở module-load time trong materialIconConverter.android.js
// → kéo cả 6.4 MB @expo-google-fonts/material-symbols fonts vào bundle.
// Nếu sau này dùng NativeTabs với material symbols icons, xóa file này + xóa
// alias trong metro.config.js để dùng expo-symbols thật.
module.exports = {
  unstable_getMaterialSymbolSourceAsync: () => {
    throw new Error(
      '[expo-symbols] stubbed via metro.config.js — NativeTabs material icons not supported in this app.'
    );
  },
};

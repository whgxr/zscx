import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.zscx.h5app',
  appName: '房屋征收调查',
  webDir: 'www',
  server: {
    // 生产环境请替换为实际部署的 H5 地址
    url: process.env.CAPACITOR_SERVER_URL || 'http://localhost:3000/h5',
    cleartext: true,
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#3b82f6',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
  },
}

export default config

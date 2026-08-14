const app = getApp()

Page({
  data: {
    username: '',
    password: '',
    captchaId: '',
    captchaImage: '',
    captchaCode: '',
    loading: false,
  },

  onLoad() {
    this.fetchCaptcha()
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  onCaptchaInput(e) {
    this.setData({ captchaCode: e.detail.value })
  },

  async fetchCaptcha() {
    try {
      const res = await app.request({
        url: '/api/auth/captcha',
        method: 'GET',
      })
      this.setData({
        captchaId: res.captchaId || '',
        captchaImage: res.image || '',
        captchaCode: '',
      })
    } catch (err) {
      console.error('Load captcha error:', err)
    }
  },

  async handleLogin() {
    const { username, password, captchaId, captchaCode } = this.data
    if (!username || !password) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' })
      return
    }
    if (!captchaCode) {
      wx.showToast({ title: '请输入验证码', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    try {
      const res = await app.request({
        url: '/api/auth/login',
        method: 'POST',
        data: { username, password, captchaId, captchaCode },
      })

      if (res.success) {
        app.globalData.token = res.token
        app.globalData.userInfo = res.user
        wx.setStorageSync('token', res.token)
        wx.setStorageSync('userInfo', res.user)

        wx.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1000)
      }
    } catch (err) {
      console.error('Login error:', err)
      // 登录失败后刷新验证码
      this.fetchCaptcha()
    } finally {
      this.setData({ loading: false })
    }
  },
})

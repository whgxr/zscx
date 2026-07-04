App({
  globalData: {
    baseUrl: 'https://your-api-domain.com',
    token: '',
    userInfo: null,
  },

  onLaunch() {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')
    if (token) {
      this.globalData.token = token
    }
    if (userInfo) {
      this.globalData.userInfo = userInfo
    }
  },

  request(options) {
    const { url, method = 'GET', data = {}, header = {} } = options
    const token = this.globalData.token

    return new Promise((resolve, reject) => {
      wx.request({
        url: this.globalData.baseUrl + url,
        method,
        data,
        header: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          ...header,
        },
        success: (res) => {
          if (res.statusCode === 401) {
            this.globalData.token = ''
            this.globalData.userInfo = null
            wx.removeStorageSync('token')
            wx.removeStorageSync('userInfo')
            wx.navigateTo({ url: '/pages/login/login' })
            reject(new Error('未登录'))
            return
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
          } else {
            const message = res.data?.message || '请求失败'
            wx.showToast({ title: message, icon: 'none' })
            reject(new Error(message))
          }
        },
        fail: (err) => {
          wx.showToast({ title: '网络错误', icon: 'none' })
          reject(err)
        },
      })
    })
  },

  uploadFile(options) {
    const { url, filePath, name = 'file', formData = {} } = options
    const token = this.globalData.token

    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: this.globalData.baseUrl + url,
        filePath,
        name,
        formData,
        header: token ? { 'Authorization': `Bearer ${token}` } : {},
        success: (res) => {
          try {
            const data = JSON.parse(res.data)
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data)
            } else {
              wx.showToast({ title: data.message || '上传失败', icon: 'none' })
              reject(new Error(data.message || '上传失败'))
            }
          } catch (e) {
            reject(e)
          }
        },
        fail: (err) => {
          wx.showToast({ title: '上传失败', icon: 'none' })
          reject(err)
        },
      })
    })
  },
})

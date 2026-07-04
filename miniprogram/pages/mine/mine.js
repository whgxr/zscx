const app = getApp()

Page({
  data: {
    userInfo: null,
  },

  onShow() {
    this.setData({ userInfo: app.globalData.userInfo })
  },

  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.globalData.token = ''
          app.globalData.userInfo = null
          wx.removeStorageSync('token')
          wx.removeStorageSync('userInfo')
          wx.redirectTo({ url: '/pages/login/login' })
        }
      },
    })
  },

  goToAbout() {
    wx.showModal({
      title: '关于',
      content: '房屋征收调查系统\n版本 1.0.0',
      showCancel: false,
    })
  },
})

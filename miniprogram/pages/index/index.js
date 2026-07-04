const app = getApp()

Page({
  data: {
    tables: [],
    loading: true,
    userInfo: null,
  },

  onShow() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData()
    wx.stopPullDownRefresh()
  },

  async loadData() {
    const token = app.globalData.token
    if (!token) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }

    this.setData({ 
      loading: true,
      userInfo: app.globalData.userInfo,
    })

    try {
      const res = await app.request({
        url: '/api/tables?status=ACTIVE',
        method: 'GET',
      })

      this.setData({ tables: res.tables || [] })
    } catch (err) {
      console.error('Load tables error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  goToList(e) {
    const tableName = e.currentTarget.dataset.name
    const tableLabel = e.currentTarget.dataset.label
    wx.navigateTo({
      url: `/pages/list/list?tableName=${tableName}&tableLabel=${tableLabel}`,
    })
  },
})

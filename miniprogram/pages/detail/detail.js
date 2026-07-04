const app = getApp()

Page({
  data: {
    tableName: '',
    id: '',
    record: null,
    fields: [],
    formFields: [],
    loading: true,
  },

  onLoad(options) {
    this.setData({
      tableName: options.tableName,
      id: options.id,
    })
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ loading: true })
    try {
      const [recordRes, tableRes] = await Promise.all([
        app.request({
          url: `/api/data/${this.data.tableName}/${this.data.id}`,
          method: 'GET',
        }),
        app.request({
          url: `/api/tables`,
          method: 'GET',
        }),
      ])

      const table = tableRes.tables?.find(t => t.name === this.data.tableName)
      const fields = table?.fields || []
      const formFields = fields.filter(f => f.showInForm)

      this.setData({
        record: recordRes.record,
        fields,
        formFields,
      })

      wx.setNavigationBarTitle({ title: `记录 #${this.data.id}` })
    } catch (err) {
      console.error('Load detail error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  goToEdit() {
    wx.navigateTo({
      url: `/pages/edit/edit?tableName=${this.data.tableName}&id=${this.data.id}`,
    })
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.url
    const urls = e.currentTarget.dataset.urls || [current]
    wx.previewImage({ current, urls })
  },
})

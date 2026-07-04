const app = getApp()

Page({
  data: {
    tableName: '',
    tableLabel: '',
    records: [],
    fields: [],
    listFields: [],
    loading: true,
    searchText: '',
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
  },

  onLoad(options) {
    this.setData({
      tableName: options.tableName,
      tableLabel: options.tableLabel || '数据列表',
    })
    wx.setNavigationBarTitle({ title: options.tableLabel || '数据列表' })
    this.loadRecords()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, records: [], hasMore: true })
    this.loadRecords()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadRecords(true)
    }
  },

  onSearchInput(e) {
    this.setData({ searchText: e.detail.value })
  },

  onSearch() {
    this.setData({ page: 1, records: [], hasMore: true })
    this.loadRecords()
  },

  async loadRecords(loadMore = false) {
    this.setData({ loading: true })

    try {
      const params = new URLSearchParams({
        page: this.data.page.toString(),
        pageSize: this.data.pageSize.toString(),
      })
      if (this.data.searchText) {
        params.append('search', this.data.searchText)
      }

      const res = await app.request({
        url: `/api/data/${this.data.tableName}?${params.toString()}`,
        method: 'GET',
      })

      const listFields = (res.fields || []).filter(f => f.showInList)
      const newRecords = res.records || []

      this.setData({
        records: loadMore ? [...this.data.records, ...newRecords] : newRecords,
        fields: res.fields || [],
        listFields,
        total: res.total || 0,
        hasMore: newRecords.length >= this.data.pageSize,
      })
    } catch (err) {
      console.error('Load records error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/detail?tableName=${this.data.tableName}&id=${id}`,
    })
  },

  goToAdd() {
    wx.navigateTo({
      url: `/pages/edit/edit?tableName=${this.data.tableName}&tableLabel=${this.data.tableLabel}`,
    })
  },

  getFieldValue(record, field) {
    return record.data?.[field.name] || '-'
  },
})

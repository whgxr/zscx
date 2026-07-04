const app = getApp()

Page({
  data: {
    tableName: '',
    tableLabel: '',
    id: '',
    isEdit: false,
    fields: [],
    formFields: [],
    formData: {},
    loading: false,
    submitting: false,
  },

  onLoad(options) {
    const isEdit = !!options.id
    this.setData({
      tableName: options.tableName,
      tableLabel: options.tableLabel || '',
      id: options.id || '',
      isEdit,
    })
    wx.setNavigationBarTitle({ title: isEdit ? '编辑记录' : '新增记录' })
    this.loadFields()
  },

  async loadFields() {
    this.setData({ loading: true })
    try {
      const res = await app.request({
        url: '/api/tables',
        method: 'GET',
      })
      
      const table = res.tables?.find(t => t.name === this.data.tableName)
      const fields = table?.fields || []
      const formFields = fields.filter(f => f.showInForm)

      const formData = {}
      formFields.forEach(f => {
        formData[f.name] = f.defaultValue || ''
      })

      this.setData({ fields, formFields, formData })

      if (this.data.isEdit) {
        this.loadRecord()
      }
    } catch (err) {
      console.error('Load fields error:', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadRecord() {
    try {
      const res = await app.request({
        url: `/api/data/${this.data.tableName}/${this.data.id}`,
        method: 'GET',
      })
      const data = res.record?.data || {}
      this.setData({ formData: { ...this.data.formData, ...data } })
    } catch (err) {
      console.error('Load record error:', err)
    }
  },

  onInputChange(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`formData.${field}`]: value,
    })
  },

  onPickerChange(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`formData.${field}`]: value,
    })
  },

  chooseImage(e) {
    const field = e.currentTarget.dataset.field
    const currentImages = this.data.formData[field] || []
    
    wx.chooseMedia({
      count: 9 - currentImages.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        try {
          const uploadedUrls = []
          for (const file of res.tempFiles) {
          try {
            const uploadRes = await app.uploadFile({
              url: '/api/upload',
              filePath: file.tempFilePath,
              name: 'file',
              formData: { fieldName: field },
            })
            uploadedUrls.push(uploadRes.url)
          } catch (err) {
            console.error('Upload error:', err)
          }
        }
          const newImages = [...currentImages, ...uploadedUrls]
          this.setData({ [`formData.${field}`]: newImages })
        } catch (err) {
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
    })
  },

  removeImage(e) {
    const field = e.currentTarget.dataset.field
    const index = e.currentTarget.dataset.index
    const currentImages = this.data.formData[field] || []
    currentImages.splice(index, 1)
    this.setData({ [`formData.${field}`]: currentImages })
  },

  previewImage(e) {
    const field = e.currentTarget.dataset.field
    const index = e.currentTarget.dataset.index
    const urls = this.data.formData[field] || []
    wx.previewImage({
      current: urls[index],
      urls,
    })
  },

  async handleSubmit(status = 'SUBMITTED') {
    const requiredFields = this.data.formFields.filter(f => f.required)
    for (const field of requiredFields) {
      const value = this.data.formData[field.name]
      if (!value || (Array.isArray(value) && value.length === 0)) {
        wx.showToast({ title: `请填写${field.label}`, icon: 'none' })
        return
      }
    }

    this.setData({ submitting: true })
    try {
      const url = this.data.isEdit
        ? `/api/data/${this.data.tableName}/${this.data.id}`
        : `/api/data/${this.data.tableName}`
      const method = this.data.isEdit ? 'PUT' : 'POST'

      const res = await app.request({
        url,
        method,
        data: {
          data: this.data.formData,
          status,
        },
      })

      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1000)
    } catch (err) {
      console.error('Submit error:', err)
    } finally {
      this.setData({ submitting: false })
    }
  },

  saveDraft() {
    this.handleSubmit('DRAFT')
  },

  submitForm() {
    this.handleSubmit('SUBMITTED')
  },

  getOptions(field) {
    return field.options || []
  },
})

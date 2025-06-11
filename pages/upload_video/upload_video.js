Page({
  /**
   * 页面的初始数据
   */
  data: {
    tempFilePath: '', // 临时视频文件路径
    resultText: '',   // 识别出的文本结果
    isLoading: false, // 是否正在加载（上传和识别过程）
  },

  /**
   * 选择视频的方法
   */
  chooseVideo() {
    const that = this;
    wx.chooseMedia({
      count: 1, // 最多可选择的文件个数
      mediaType: ['video'], // 文件类型
      sourceType: ['album', 'camera'], // 文件来源：相册和相机
      maxDuration: 60, // 拍摄视频最长拍摄时间，单位秒
      success(res) {
        console.log('选择视频成功', res);
        const videoPath = res.tempFiles[0].tempFilePath;
        that.setData({
          tempFilePath: videoPath,
          resultText: '' // 清空上一次的结果
        });
        // 选择成功后直接调用上传方法
        that.uploadAndRecognize(videoPath);
      },
      fail(err) {
        console.log('选择视频失败', err);
        wx.showToast({
          title: '选择视频失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 上传视频并获取识别结果
   * @param {string} filePath 视频文件的临时路径
   */
  uploadAndRecognize(filePath) {
    if (!filePath) {
      wx.showToast({
        title: '未选择视频文件',
        icon: 'none'
      });
      return;
    }

    this.setData({
      isLoading: true, // 显示加载提示
    });

    // 这里是上传文件的核心代码
    wx.uploadFile({
      // =======================> 这里需要替换成你自己的后端API地址 <=======================
      url: 'https://481ir8ai2389.vicp.fun/test', 
      // ===================================================================================

      filePath: filePath,
      name: 'videoFile', // 后端接收文件时使用的字段名，需要和后端约定好
      formData: {
        // 这里可以添加一些额外的表单数据，比如用户ID等
        'userId': 'user123'
      },
      
      success: (res) => {
        console.log('上传成功', res);
        // 服务器返回的数据通常是 JSON 字符串，需要解析
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(res.data);
            // 假设后端返回的格式是 { success: true, text: '识别的文字' }
            if (data.success) {
              this.setData({
                resultText: data.text || '服务器未返回有效文本'
              });
            } else {
              throw new Error(data.message || '服务器处理失败');
            }
          } catch (e) {
            console.error('解析服务器返回数据失败', e);
            wx.showToast({
              title: '解析数据失败',
              icon: 'error'
            });
            this.setData({ resultText: '处理结果格式错误' });
          }
        } else {
          // HTTP 状态码不是 200 的情况
          wx.showToast({
            title: `服务器错误: ${res.statusCode}`,
            icon: 'error'
          });
          this.setData({ resultText: `请求失败，状态码 ${res.statusCode}` });
        }
      },
      
      fail: (err) => {
        console.error('上传失败', err);
        wx.showToast({
          title: '上传失败，请检查网络',
          icon: 'error'
        });
        this.setData({
          resultText: '上传失败，请重试'
        });
      },

      complete: () => {
        // 不管成功还是失败，最后都关闭加载状态
        this.setData({
          isLoading: false
        });
      }
    });
  },

  /**
   * 复制识别结果到剪贴板
   */
  copyText() {
    if (!this.data.resultText) {
      return;
    }
    wx.setClipboardData({
      data: this.data.resultText,
      success() {
        wx.showToast({
          title: '已复制',
          icon: 'success'
        });
      }
    });
  }
});
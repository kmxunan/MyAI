import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// 创建axios实例
const businessApi = axios.create({
  baseURL: `${API_BASE_URL}/api/business`,
  timeout: 30000,
});

// 请求拦截器 - 添加认证token
businessApi.interceptors.request.use(
  (config) => {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const authData = JSON.parse(authStorage);
        const token = authData.state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.error('Error parsing auth token:', error);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误
businessApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 仅透传401错误，由上层路由守卫/页面逻辑处理登出与跳转，避免循环重定向
      // 可选：在此处清理本地缓存或发布事件
    }
    return Promise.reject(error);
  }
);

export const businessService = {
  // 客户管理
  async getCustomers(params = {}) {
    try {
      const response = await businessApi.get('/customers', { params });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch customers:', error);
      throw error;
    }
  },

  async createCustomer(data) {
    try {
      const response = await businessApi.post('/customers', data);
      return response.data;
    } catch (error) {
      console.error('Failed to create customer:', error);
      throw error;
    }
  },

  async getCustomer(id) {
    try {
      const response = await businessApi.get(`/customers/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch customer:', error);
      throw error;
    }
  },

  async updateCustomer(id, data) {
    try {
      const response = await businessApi.put(`/customers/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Failed to update customer:', error);
      throw error;
    }
  },

  async deleteCustomer(id) {
    try {
      const response = await businessApi.delete(`/customers/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to delete customer:', error);
      throw error;
    }
  },

  // 项目管理
  async getProjects(params = {}) {
    try {
      const response = await businessApi.get('/projects', { params });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      throw error;
    }
  },

  async createProject(data) {
    try {
      const response = await businessApi.post('/projects', data);
      return response.data;
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error;
    }
  },

  async getProject(id) {
    try {
      const response = await businessApi.get(`/projects/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch project:', error);
      throw error;
    }
  },

  async updateProject(id, data) {
    try {
      const response = await businessApi.put(`/projects/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Failed to update project:', error);
      throw error;
    }
  },

  async deleteProject(id) {
    try {
      const response = await businessApi.delete(`/projects/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  },

  // 合同管理
  async getContracts(params = {}) {
    try {
      const response = await businessApi.get('/contracts', { params });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch contracts:', error);
      throw error;
    }
  },

  async createContract(data) {
    try {
      const response = await businessApi.post('/contracts', data);
      return response.data;
    } catch (error) {
      console.error('Failed to create contract:', error);
      throw error;
    }
  },

  async getContract(id) {
    try {
      const response = await businessApi.get(`/contracts/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch contract:', error);
      throw error;
    }
  },

  async updateContract(id, data) {
    try {
      const response = await businessApi.put(`/contracts/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Failed to update contract:', error);
      throw error;
    }
  },

  async deleteContract(id) {
    try {
      const response = await businessApi.delete(`/contracts/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to delete contract:', error);
      throw error;
    }
  },

  // 财务记录管理
  async getFinancialRecords(params = {}) {
    try {
      const response = await businessApi.get('/financial-records', { params });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch financial records:', error);
      throw error;
    }
  },

  async createFinancialRecord(data) {
    try {
      const response = await businessApi.post('/financial-records', data);
      return response.data;
    } catch (error) {
      console.error('Failed to create financial record:', error);
      throw error;
    }
  },

  async getFinancialRecord(id) {
    try {
      const response = await businessApi.get(`/financial-records/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch financial record:', error);
      throw error;
    }
  },

  async updateFinancialRecord(id, data) {
    try {
      const response = await businessApi.put(`/financial-records/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Failed to update financial record:', error);
      throw error;
    }
  },

  async deleteFinancialRecord(id) {
    try {
      const response = await businessApi.delete(`/financial-records/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to delete financial record:', error);
      throw error;
    }
  },

  // 仪表板数据
  async getDashboardData(timeRange = 30) {
    try {
      const response = await businessApi.get('/dashboard', {
        params: { timeRange }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      throw error;
    }
  },

  // 获取仪表盘统计数据
  async getDashboardStats() {
    try {
      const response = await businessApi.get('/dashboard/stats');
      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.message || '获取统计数据失败');
      }
    } catch (error) {
      console.error('Get dashboard stats failed:', error);
      // 返回默认数据作为后备
      return {
        totalChats: 0,
        totalTokens: 0,
        activeModels: 0,
        successRate: 0
      };
    }
  },

  // AI报告生成
  async generateReport(templateId, formData) {
    try {
      // 这里需要调用AI服务来生成报告
      // 暂时使用聊天API来生成报告内容
      const chatApi = axios.create({
        baseURL: `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/chat`,
        timeout: 60000,
      });
      
      chatApi.interceptors.request.use(
        (config) => {
          const authStorage = localStorage.getItem('auth-storage');
          if (authStorage) {
            try {
              const authData = JSON.parse(authStorage);
              const token = authData.state?.token;
              if (token) {
                config.headers.Authorization = `Bearer ${token}`;
              }
            } catch (error) {
              console.error('Error parsing auth token:', error);
            }
          }
          return config;
        },
        (error) => {
          return Promise.reject(error);
        }
      );
      
      // 构建报告生成的提示词
      const prompt = this.buildReportPrompt(templateId, formData);
      
      const response = await chatApi.post('/conversations', {
        systemPrompt: '你是一个专业的商业分析师，擅长生成各种商业报告。请根据用户提供的信息生成专业、详细的报告。',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });
      
      return {
        success: true,
        data: {
          id: Date.now(),
          title: this.getReportTitle(templateId, formData),
          type: this.getTemplateTitle(templateId),
          content: response.data.data.messages[response.data.data.messages.length - 1].content,
          createdAt: new Date().toISOString(),
          status: 'completed'
        }
      };
    } catch (error) {
      console.error('Failed to generate report:', error);
      throw error;
    }
  },

  // 构建报告生成提示词
  buildReportPrompt(templateId, formData) {
    const templates = {
      'market-analysis': {
        title: '市场分析报告',
        prompt: `请为${formData.industry}行业在${formData.region}地区生成一份详细的市场分析报告，时间范围为${formData.timeframe}。主要竞争对手包括：${formData.competitors}。报告应包含市场概况、竞争分析、机会识别、风险评估和建议措施等部分。`
      },
      'business-plan': {
        title: '商业计划书',
        prompt: `请为${formData.businessName}公司生成一份完整的商业计划书。业务类型：${formData.businessType}，目标市场：${formData.targetMarket}，资金需求：${formData.fundingNeeds}。计划书应包含执行摘要、公司描述、市场分析、组织管理、产品服务、营销策略、财务预测等部分。`
      },
      'financial-forecast': {
        title: '财务预测',
        prompt: `请基于当前年收入${formData.revenue}元，预期增长率${formData.growthRate}%，为期${formData.period}生成详细的财务预测报告。主要成本包括：${formData.costs}。报告应包含收入预测、成本分析、利润预测、现金流分析等。`
      },
      'marketing-strategy': {
        title: '营销策略',
        prompt: `请为${formData.product}产品/服务制定营销策略。目标受众：${formData.targetAudience}，营销预算：${formData.budget}，营销渠道：${formData.channels}。策略应包含市场定位、目标客户分析、营销组合、推广计划、预算分配等。`
      },
      'swot-analysis': {
        title: 'SWOT分析',
        prompt: `请为${formData.company}公司（${formData.industry}行业）进行SWOT分析。分析背景：${formData.context}。分析应包含优势(Strengths)、劣势(Weaknesses)、机会(Opportunities)、威胁(Threats)四个方面的详细分析和战略建议。`
      },
      'product-launch': {
        title: '产品发布计划',
        prompt: `请为${formData.productName}（${formData.productType}）制定产品发布计划。计划发布日期：${formData.launchDate}，目标市场：${formData.targetMarket}。计划应包含发布策略、时间表、营销活动、风险管理、成功指标等。`
      }
    };
    
    return templates[templateId]?.prompt || '请生成一份商业报告。';
  },

  // 获取报告标题
  getReportTitle(templateId, formData) {
    const templates = {
      'market-analysis': `${formData.industry || ''}市场分析报告`,
      'business-plan': `${formData.businessName || ''}商业计划书`,
      'financial-forecast': `${formData.period || ''}财务预测报告`,
      'marketing-strategy': `${formData.product || ''}营销策略`,
      'swot-analysis': `${formData.company || ''}SWOT分析`,
      'product-launch': `${formData.productName || ''}产品发布计划`
    };
    
    return templates[templateId] || '商业报告';
  },

  // 获取模板标题
  getTemplateTitle(templateId) {
    const templates = {
      'market-analysis': '市场分析报告',
      'business-plan': '商业计划书',
      'financial-forecast': '财务预测',
      'marketing-strategy': '营销策略',
      'swot-analysis': 'SWOT分析',
      'product-launch': '产品发布计划'
    };
    
    return templates[templateId] || '商业报告';
  }
};

export default businessService;
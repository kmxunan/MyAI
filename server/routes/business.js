const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const Customer = require('../models/Customer');
const Project = require('../models/Project');
const Contract = require('../models/Contract');
const FinancialRecord = require('../models/FinancialRecord');
const { authMiddleware: authenticateToken, requirePermission: checkPermission } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// 业务操作速率限制
const businessRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP每15分钟最多100次请求
  message: {
    success: false,
    message: 'Too many business requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 应用速率限制到所有业务路由
router.use(businessRateLimit);

// 验证规则
const customerValidation = [
  body('name')
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('Customer name is required and must be 1-100 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('phone')
    .optional()
    .matches(/^[+]?[1-9][\d]{0,15}$/)
    .withMessage('Please provide a valid phone number'),
  body('company')
    .optional()
    .isLength({ max: 100 })
    .trim()
    .withMessage('Company name cannot exceed 100 characters'),
  body('address')
    .optional()
    .isLength({ max: 500 })
    .trim()
    .withMessage('Address cannot exceed 500 characters'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .trim()
    .withMessage('Notes cannot exceed 1000 characters')
];

const projectValidation = [
  body('name')
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('Project name is required and must be 1-100 characters'),
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .trim()
    .withMessage('Description cannot exceed 2000 characters'),
  body('customer')
    .notEmpty()
    .isMongoId()
    .withMessage('Valid customer ID is required'),
  body('status')
    .optional()
    .isIn(['planning', 'active', 'on_hold', 'completed', 'cancelled'])
    .withMessage('Invalid project status'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority level'),
  body('budget')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Budget must be a positive number'),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid start date'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid end date'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

const contractValidation = [
  body('title')
    .notEmpty()
    .isLength({ min: 1, max: 200 })
    .trim()
    .withMessage('Contract title is required and must be 1-200 characters'),
  body('customer')
    .notEmpty()
    .isMongoId()
    .withMessage('Valid customer ID is required'),
  body('project')
    .optional()
    .isMongoId()
    .withMessage('Valid project ID is required'),
  body('type')
    .notEmpty()
    .isIn(['service', 'product', 'maintenance', 'consulting', 'other'])
    .withMessage('Invalid contract type'),
  body('status')
    .optional()
    .isIn(['draft', 'pending', 'active', 'completed', 'terminated'])
    .withMessage('Invalid contract status'),
  body('value')
    .notEmpty()
    .isFloat({ min: 0 })
    .withMessage('Contract value is required and must be positive'),
  body('startDate')
    .notEmpty()
    .isISO8601()
    .withMessage('Start date is required'),
  body('endDate')
    .notEmpty()
    .isISO8601()
    .withMessage('End date is required'),
  body('terms')
    .optional()
    .isLength({ max: 5000 })
    .trim()
    .withMessage('Terms cannot exceed 5000 characters')
];

const financialRecordValidation = [
  body('type')
    .notEmpty()
    .isIn(['income', 'expense'])
    .withMessage('Type must be either income or expense'),
  body('category')
    .notEmpty()
    .isLength({ min: 1, max: 50 })
    .trim()
    .withMessage('Category is required and must be 1-50 characters'),
  body('amount')
    .notEmpty()
    .isFloat({ min: 0.01 })
    .withMessage('Amount is required and must be positive'),
  body('description')
    .notEmpty()
    .isLength({ min: 1, max: 500 })
    .trim()
    .withMessage('Description is required and must be 1-500 characters'),
  body('customer')
    .optional()
    .isMongoId()
    .withMessage('Valid customer ID is required'),
  body('project')
    .optional()
    .isMongoId()
    .withMessage('Valid project ID is required'),
  body('contract')
    .optional()
    .isMongoId()
    .withMessage('Valid contract ID is required'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date')
];

// ==================== 客户管理 ====================

/**
 * @swagger
 * /api/business/customers:
 *   get:
 *     summary: Get all customers
 *     tags: [Business - Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or company
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Customers retrieved successfully
 */
router.get('/customers',
  authenticateToken,
  checkPermission('business:read'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().isLength({ max: 100 }).trim(),
    query('status').optional().isIn(['active', 'inactive'])
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { page = 1, limit = 20, search, status } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { user: req.user.id };
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }
    
    const customers = await Customer.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await Customer.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
);

/**
 * @swagger
 * /api/business/customers:
 *   post:
 *     summary: Create a new customer
 *     tags: [Business - Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               company:
 *                 type: string
 *                 maxLength: 100
 *               address:
 *                 type: string
 *                 maxLength: 500
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       201:
 *         description: Customer created successfully
 */
router.post('/customers',
  authenticateToken,
  checkPermission('business:write'),
  customerValidation,
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const customerData = {
      ...req.body,
      user: req.user.id
    };
    
    const customer = new Customer(customerData);
    await customer.save();
    
    logger.logBusinessOperation('customer_created', {
      userId: req.user.id,
      customerId: customer._id,
      customerName: customer.name
    });
    
    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: {
        customer
      }
    });
  })
);

/**
 * @swagger
 * /api/business/customers/{id}:
 *   get:
 *     summary: Get customer by ID
 *     tags: [Business - Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer retrieved successfully
 *       404:
 *         description: Customer not found
 */
router.get('/customers/:id',
  authenticateToken,
  checkPermission('business:read'),
  [
    param('id').isMongoId().withMessage('Invalid customer ID')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const customer = await Customer.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // 获取相关项目和合同
    const projects = await Project.find({ customer: customer._id }).select('name status');
    const contracts = await Contract.find({ customer: customer._id }).select('title status value');
    
    res.json({
      success: true,
      data: {
        customer,
        projects,
        contracts
      }
    });
  })
);

/**
 * @swagger
 * /api/business/customers/{id}:
 *   put:
 *     summary: Update customer
 *     tags: [Business - Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               company:
 *                 type: string
 *                 maxLength: 100
 *               address:
 *                 type: string
 *                 maxLength: 500
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Customer updated successfully
 */
router.put('/customers/:id',
  authenticateToken,
  checkPermission('business:write'),
  [
    param('id').isMongoId().withMessage('Invalid customer ID'),
    ...customerValidation.map(rule => rule.optional()),
    body('status').optional().isIn(['active', 'inactive']).withMessage('Invalid status')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const customer = await Customer.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user.id
      },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    logger.logBusinessOperation('customer_updated', {
      userId: req.user.id,
      customerId: customer._id,
      updates: Object.keys(req.body)
    });
    
    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: {
        customer
      }
    });
  })
);

/**
 * @swagger
 * /api/business/customers/{id}:
 *   delete:
 *     summary: Delete customer
 *     tags: [Business - Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer deleted successfully
 */
router.delete('/customers/:id',
  authenticateToken,
  checkPermission('business:delete'),
  [
    param('id').isMongoId().withMessage('Invalid customer ID')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    // 检查是否有关联的项目或合同
    const projectCount = await Project.countDocuments({ customer: req.params.id });
    const contractCount = await Contract.countDocuments({ customer: req.params.id });
    
    if (projectCount > 0 || contractCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete customer with associated projects or contracts'
      });
    }
    
    const customer = await Customer.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    logger.logBusinessOperation('customer_deleted', {
      userId: req.user.id,
      customerId: customer._id,
      customerName: customer.name
    });
    
    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  })
);

// ==================== 项目管理 ====================

/**
 * @swagger
 * /api/business/projects:
 *   get:
 *     summary: Get all projects
 *     tags: [Business - Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [planning, active, on_hold, completed, cancelled]
 *       - in: query
 *         name: customer
 *         schema:
 *           type: string
 *         description: Customer ID
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *     responses:
 *       200:
 *         description: Projects retrieved successfully
 */
router.get('/projects',
  authenticateToken,
  checkPermission('business:read'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['planning', 'active', 'on_hold', 'completed', 'cancelled']),
    query('customer').optional().isMongoId().withMessage('Invalid customer ID'),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { page = 1, limit = 20, status, customer, priority } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { user: req.user.id };
    
    if (status) query.status = status;
    if (customer) query.customer = customer;
    if (priority) query.priority = priority;
    
    const projects = await Project.find(query)
      .populate('customer', 'name company')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await Project.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        projects,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
);

/**
 * @swagger
 * /api/business/projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Business - Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - customer
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 2000
 *               customer:
 *                 type: string
 *                 description: Customer ID
 *               status:
 *                 type: string
 *                 enum: [planning, active, on_hold, completed, cancelled]
 *                 default: planning
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 default: medium
 *               budget:
 *                 type: number
 *                 minimum: 0
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Project created successfully
 */
router.post('/projects',
  authenticateToken,
  checkPermission('business:write'),
  projectValidation,
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    // 验证客户是否存在且属于当前用户
    const customer = await Customer.findOne({
      _id: req.body.customer,
      user: req.user.id
    });
    
    if (!customer) {
      return res.status(400).json({
        success: false,
        message: 'Customer not found or access denied'
      });
    }
    
    const projectData = {
      ...req.body,
      user: req.user.id
    };
    
    const project = new Project(projectData);
    await project.save();
    
    await project.populate('customer', 'name company');
    
    logger.logBusinessOperation('project_created', {
      userId: req.user.id,
      projectId: project._id,
      projectName: project.name,
      customerId: customer._id
    });
    
    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: {
        project
      }
    });
  })
);

// ==================== 合同管理 ====================

/**
 * @swagger
 * /api/business/contracts:
 *   get:
 *     summary: Get all contracts
 *     tags: [Business - Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, pending, active, completed, terminated]
 *       - in: query
 *         name: customer
 *         schema:
 *           type: string
 *         description: Customer ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [service, product, maintenance, consulting, other]
 *     responses:
 *       200:
 *         description: Contracts retrieved successfully
 */
router.get('/contracts',
  authenticateToken,
  checkPermission('business:read'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['draft', 'pending', 'active', 'completed', 'terminated']),
    query('customer').optional().isMongoId().withMessage('Invalid customer ID'),
    query('type').optional().isIn(['service', 'product', 'maintenance', 'consulting', 'other'])
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { page = 1, limit = 20, status, customer, type } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { user: req.user.id };
    
    if (status) query.status = status;
    if (customer) query.customer = customer;
    if (type) query.type = type;
    
    const contracts = await Contract.find(query)
      .populate('customer', 'name company')
      .populate('project', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await Contract.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        contracts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
);

/**
 * @swagger
 * /api/business/contracts:
 *   post:
 *     summary: Create a new contract
 *     tags: [Business - Contracts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - customer
 *               - type
 *               - value
 *               - startDate
 *               - endDate
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               customer:
 *                 type: string
 *                 description: Customer ID
 *               project:
 *                 type: string
 *                 description: Project ID (optional)
 *               type:
 *                 type: string
 *                 enum: [service, product, maintenance, consulting, other]
 *               status:
 *                 type: string
 *                 enum: [draft, pending, active, completed, terminated]
 *                 default: draft
 *               value:
 *                 type: number
 *                 minimum: 0
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               terms:
 *                 type: string
 *                 maxLength: 5000
 *     responses:
 *       201:
 *         description: Contract created successfully
 */
router.post('/contracts',
  authenticateToken,
  checkPermission('business:write'),
  contractValidation,
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    // 验证客户是否存在且属于当前用户
    const customer = await Customer.findOne({
      _id: req.body.customer,
      user: req.user.id
    });
    
    if (!customer) {
      return res.status(400).json({
        success: false,
        message: 'Customer not found or access denied'
      });
    }
    
    // 如果指定了项目，验证项目是否存在且属于当前用户
    if (req.body.project) {
      const project = await Project.findOne({
        _id: req.body.project,
        user: req.user.id
      });
      
      if (!project) {
        return res.status(400).json({
          success: false,
          message: 'Project not found or access denied'
        });
      }
    }
    
    const contractData = {
      ...req.body,
      user: req.user.id
    };
    
    const contract = new Contract(contractData);
    await contract.save();
    
    await contract.populate([
      { path: 'customer', select: 'name company' },
      { path: 'project', select: 'name' }
    ]);
    
    logger.logBusinessOperation('contract_created', {
      userId: req.user.id,
      contractId: contract._id,
      contractTitle: contract.title,
      customerId: customer._id,
      value: contract.value
    });
    
    res.status(201).json({
      success: true,
      message: 'Contract created successfully',
      data: {
        contract
      }
    });
  })
);

// ==================== 财务记录管理 ====================

/**
 * @swagger
 * /api/business/financial-records:
 *   get:
 *     summary: Get all financial records
 *     tags: [Business - Financial Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [income, expense]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: customer
 *         schema:
 *           type: string
 *         description: Customer ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Financial records retrieved successfully
 */
router.get('/financial-records',
  authenticateToken,
  checkPermission('business:read'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('type').optional().isIn(['income', 'expense']),
    query('category').optional().isLength({ max: 50 }).trim(),
    query('customer').optional().isMongoId().withMessage('Invalid customer ID'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { page = 1, limit = 20, type, category, customer, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { user: req.user.id };
    
    if (type) query.type = type;
    if (category) query.category = category;
    if (customer) query.customer = customer;
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const records = await FinancialRecord.find(query)
      .populate('customer', 'name company')
      .populate('project', 'name')
      .populate('contract', 'title')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await FinancialRecord.countDocuments(query);
    
    // 计算汇总信息
    const summary = await FinancialRecord.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const summaryData = {
      income: { total: 0, count: 0 },
      expense: { total: 0, count: 0 }
    };
    
    summary.forEach(item => {
      summaryData[item._id] = {
        total: item.total,
        count: item.count
      };
    });
    
    summaryData.net = summaryData.income.total - summaryData.expense.total;
    
    res.json({
      success: true,
      data: {
        records,
        summary: summaryData,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
);

/**
 * @swagger
 * /api/business/financial-records:
 *   post:
 *     summary: Create a new financial record
 *     tags: [Business - Financial Records]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - category
 *               - amount
 *               - description
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [income, expense]
 *               category:
 *                 type: string
 *                 maxLength: 50
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               customer:
 *                 type: string
 *                 description: Customer ID (optional)
 *               project:
 *                 type: string
 *                 description: Project ID (optional)
 *               contract:
 *                 type: string
 *                 description: Contract ID (optional)
 *               date:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Financial record created successfully
 */
router.post('/financial-records',
  authenticateToken,
  checkPermission('business:write'),
  financialRecordValidation,
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    // 验证关联实体是否存在且属于当前用户
    if (req.body.customer) {
      const customer = await Customer.findOne({
        _id: req.body.customer,
        user: req.user.id
      });
      
      if (!customer) {
        return res.status(400).json({
          success: false,
          message: 'Customer not found or access denied'
        });
      }
    }
    
    if (req.body.project) {
      const project = await Project.findOne({
        _id: req.body.project,
        user: req.user.id
      });
      
      if (!project) {
        return res.status(400).json({
          success: false,
          message: 'Project not found or access denied'
        });
      }
    }
    
    if (req.body.contract) {
      const contract = await Contract.findOne({
        _id: req.body.contract,
        user: req.user.id
      });
      
      if (!contract) {
        return res.status(400).json({
          success: false,
          message: 'Contract not found or access denied'
        });
      }
    }
    
    const recordData = {
      ...req.body,
      user: req.user.id,
      date: req.body.date || new Date()
    };
    
    const record = new FinancialRecord(recordData);
    await record.save();
    
    await record.populate([
      { path: 'customer', select: 'name company' },
      { path: 'project', select: 'name' },
      { path: 'contract', select: 'title' }
    ]);
    
    logger.logBusinessOperation('financial_record_created', {
      userId: req.user.id,
      recordId: record._id,
      type: record.type,
      amount: record.amount,
      category: record.category
    });
    
    res.status(201).json({
      success: true,
      message: 'Financial record created successfully',
      data: {
        record
      }
    });
  })
);

// ==================== 统计报表 ====================

/**
 * @swagger
 * /api/business/dashboard:
 *   get:
 *     summary: Get business dashboard data
 *     tags: [Business - Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 30
 *         description: Time range in days
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 */
// Dashboard stats route (alias for /dashboard)
router.get('/dashboard/stats',
  authenticateToken,
  [
    query('timeRange').optional().isInt({ min: 1, max: 365 }).toInt()
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { timeRange = 30 } = req.query;
    const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
    const userId = req.user.id;
    
    // 客户统计
    const customerStats = await Customer.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // 项目统计
    const projectStats = await Project.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalBudget: { $sum: '$budget' }
        }
      }
    ]);
    
    // 合同统计
    const contractStats = await Contract.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$value' }
        }
      }
    ]);
    
    // 财务统计
    const financialStats = await FinancialRecord.aggregate([
      {
        $match: {
          user: userId,
          date: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // 月度财务趋势
    const monthlyTrend = await FinancialRecord.aggregate([
      {
        $match: {
          user: userId,
          date: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            type: '$type'
          },
          total: { $sum: '$amount' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);
    
    const dashboard = {
      customers: {
        total: await Customer.countDocuments({ user: userId }),
        byStatus: customerStats
      },
      projects: {
        total: await Project.countDocuments({ user: userId }),
        byStatus: projectStats
      },
      contracts: {
        total: await Contract.countDocuments({ user: userId }),
        byStatus: contractStats
      },
      financial: {
        summary: financialStats,
        monthlyTrend
      },
      timeRange
    };
    
    res.json({
      success: true,
      data: {
        dashboard
      }
    });
  })
);

router.get('/dashboard',
  authenticateToken,
  checkPermission('business:read'),
  [
    query('timeRange').optional().isInt({ min: 1, max: 365 }).toInt()
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { timeRange = 30 } = req.query;
    const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
    const userId = req.user.id;
    
    // 客户统计
    const customerStats = await Customer.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // 项目统计
    const projectStats = await Project.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalBudget: { $sum: '$budget' }
        }
      }
    ]);
    
    // 合同统计
    const contractStats = await Contract.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$value' }
        }
      }
    ]);
    
    // 财务统计
    const financialStats = await FinancialRecord.aggregate([
      {
        $match: {
          user: userId,
          date: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // 月度财务趋势
    const monthlyTrend = await FinancialRecord.aggregate([
      {
        $match: {
          user: userId,
          date: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            type: '$type'
          },
          total: { $sum: '$amount' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);
    
    const dashboard = {
      customers: {
        total: await Customer.countDocuments({ user: userId }),
        byStatus: customerStats
      },
      projects: {
        total: await Project.countDocuments({ user: userId }),
        byStatus: projectStats
      },
      contracts: {
        total: await Contract.countDocuments({ user: userId }),
        byStatus: contractStats
      },
      financial: {
        summary: financialStats,
        monthlyTrend
      },
      timeRange
    };
    
    res.json({
      success: true,
      data: {
        dashboard
      }
    });
  })
);

module.exports = router;
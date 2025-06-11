const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { protect } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/featureAccess');
const { FeatureUsage } = require('../models/FeatureUsage');
const User = require('../models/User');

// GLM-4 API配置
const GLM4_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const API_KEY = '0b30e2872b064eb7b6987da45fa91495.qyuFERurhHV7eRfn';

// 构建请求头中的认证信息
const getAuthHeaders = () => {
    return {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
    };
};

// 生成亚马逊Listing
router.post('/generate', protect, async (req, res) => {
    // 根据生成类型动态判断使用的功能
    const { generateType } = req.body;
    let featureName = 'amazon_listing'; // 默认是Listing功能
    
    // 如果是视频脚本，则使用视频脚本功能
    if (generateType === 'video-script') {
        featureName = 'amazon_video_script';
    }
    
    // 调用checkFeatureAccess中间件
    try {
        const middleware = checkFeatureAccess(featureName);
        await new Promise((resolve, reject) => {
            middleware(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    } catch (error) {
        return res.status(402).json({
            success: false,
            message: '积分不足或访问受限',
            error: error.message
        });
    }
    try {
        const {
            productFeatureCount,
            productKeywords,
            productBrand,
            productCategory,
            productSellingPoints,
            outputLanguage,
            generateType,
            customPrompt,
            title,
            bulletPoints,
            description
        } = req.body;

        // 根据generateType使用不同的提示词
        if (generateType === 'video-script') {
            logger.info(`请求生成视频脚本: ${title}`);
            
            // 使用自定义提示词
            if (customPrompt) {
                // 设置系统消息
                const systemMessage = "你是一位专业的视频脚本创作者，擅长将产品特点转化为引人入胜的广告视频脚本。";
                
                // 调用GLM-4 API
                const response = await axios.post(GLM4_API_URL, {
                    model: "GLM-4-Plus",
                    messages: [
                        {
                            role: "system",
                            content: systemMessage
                        },
                        {
                            role: "user",
                            content: customPrompt
                        }
                    ],
                    temperature: 0.7,
                    top_p: 0.8,
                    max_tokens: 4000
                }, {
                    headers: getAuthHeaders()
                });
                
                // 获取响应内容
                const content = response.data.choices[0].message.content;
                logger.info(`视频脚本生成原始响应: ${content}`);
                
                // 返回生成的脚本
                return res.json({
                    success: true,
                    data: {
                        script: content,
                        content: content,
                        description: content
                    }
                });
            }
            
            // 如果没有提供customPrompt，返回错误
            return res.status(400).json({
                success: false,
                error: "生成视频脚本需要提供customPrompt"
            });
        }
        
        // 原有的Listing生成代码
        // 确定特性条数，默认为5
        const featureCount = productFeatureCount ? parseInt(productFeatureCount) : 5;
        
        // 根据选择的语言设置system消息
        const systemMessage = outputLanguage === 'en' 
            ? "You are a professional Amazon Listing writer. Please respond in English only."
            : "你是一个专业的亚马逊Listing创作员，请只用中文回复。";
        
        // 构建提示词
        let prompt;
        if (outputLanguage === 'en') {
            prompt = `Create an attractive Amazon product listing based on the following information. Include a title, bullet points, and product description.

Note: The content must be 100% relevant to the keywords provided. If a product category is provided, the features should be based on that category. The title should be between 150-200 characters, and each bullet point should not exceed 200 characters.

Product Information:
Number of feature points: ${featureCount}
Keywords: ${productKeywords}
Brand: ${productBrand || 'None'}
Category: ${productCategory || 'None'}
Selling points: ${productSellingPoints || 'None'}

Please return in the following JSON format, with exactly ${featureCount} bullet points, no more, no less:
{
  "title": "Product Title",
  "bulletPoints": [${Array(featureCount).fill('"Feature description"').join(', ')}],
  "description": "Product description"
}`;
        } else {
            prompt = `现在你是一个Listing创作员，你拥有极丰富的商品营销经验，请你根据我提供的信息，构建吸引眼球的商品Listing。其中包括但不限于商品标题、商品特性、商品描述。

注意：其中要严谨围绕关键词展开编写创作，必须达到百分百的关键词相关性以及埋词率；当商品类目不为空时，商品特性则以商品类目的特性展开编写；标题长度在150-200个字符间，产品特性的每一条不超过200个字符。

产品信息：
商品特性的条数: ${featureCount}
商品关键词: ${productKeywords}
商品品牌: ${productBrand || '无'}
商品类目: ${productCategory || '无'}
商品卖点: ${productSellingPoints || '无'}

请按以下JSON格式返回，注意商品特性条数必须严格为${featureCount}条，不多不少:
{
  "title": "产品标题",
  "bulletPoints": [${Array(featureCount).fill('"特性描述"').join(', ')}],
  "description": "产品描述"
}`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 4000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`GLM-4原始响应: ${content}`);
            
            // 提取JSON部分 - 改进正则表达式以更精确地匹配JSON
            const jsonMatch = content.match(/(\{[\s\S]*?\})/g);
            
            if (jsonMatch && jsonMatch.length > 0) {
                // 尝试解析找到的第一个JSON对象
                try {
                    result = JSON.parse(jsonMatch[0]);
                } catch (innerError) {
                    // 如果解析失败，尝试清理JSON字符串后再解析
                    let cleanedJson = jsonMatch[0]
                        .replace(/[\u0000-\u001F]+/g, ' ')  // 移除控制字符
                        .replace(/,\s*}/g, '}')             // 修复尾部逗号
                        .replace(/,\s*]/g, ']');            // 修复数组尾部逗号
                    
                    logger.info(`尝试清理后的JSON: ${cleanedJson}`);
                    result = JSON.parse(cleanedJson);
                }
            } else {
                // 如果没有找到JSON格式，尝试构建一个基本结构
                logger.warn(`未找到JSON格式，尝试提取内容并构建结构`);
                
                // 分割内容以提取标题、产品特性和产品描述
                const lines = content.split('\n').filter(line => line.trim() !== '');
                
                // 尝试识别标题、产品特性和产品描述
                let title = '';
                let bulletPoints = [];
                let description = '';
                
                // 查找标题
                const titleMatch = content.match(/标题[：:]\s*(.*)/i) || content.match(/title[：:]\s*(.*)/i);
                if (titleMatch) title = titleMatch[1].trim();
                
                // 查找产品特性
                const bulletRegex = /[•\-\*]?\s*(.*)/g;
                let bulletMatches;
                let bulletSection = content.match(/产品特性[：:]([\s\S]*?)(?:产品描述[：:]|$)/i);
                
                if (bulletSection) {
                    while ((bulletMatches = bulletRegex.exec(bulletSection[1])) !== null) {
                        if (bulletMatches[1].trim().length > 0) {
                            bulletPoints.push(bulletMatches[1].trim());
                        }
                    }
                }
                
                // 如果没有找到足够的产品特性，尝试查找列表项
                if (bulletPoints.length < 5) {
                    const listItems = content.match(/[•\-\*]\s*(.*)/g);
                    if (listItems) {
                        bulletPoints = listItems.map(item => item.replace(/[•\-\*]\s*/, '').trim());
                    }
                }
                
                // 确保有指定数量的产品特性
                while (bulletPoints.length < featureCount) {
                    bulletPoints.push("产品特点" + (bulletPoints.length + 1));
                }
                
                // 如果超出了指定的数量，则截取
                if (bulletPoints.length > featureCount) {
                    bulletPoints = bulletPoints.slice(0, featureCount);
                }
                
                // 查找产品描述
                const descMatch = content.match(/产品描述[：:]([\s\S]*?)$/i) || content.match(/description[：:]([\s\S]*?)$/i);
                if (descMatch) description = descMatch[1].trim();
                
                result = {
                    title: title || "未能提取标题",
                    bulletPoints: bulletPoints,
                    description: description || "未能提取产品描述"
                };
            }
        } catch (parseError) {
            logger.error(`解析GLM-4响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            return res.status(500).json({ 
                error: "解析API响应失败", 
                details: parseError.message,
                message: "服务器在处理AI响应时遇到问题，请稍后再试"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成亚马逊Listing失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "生成亚马逊Listing失败",
            details: error.message
        });
    }
});

// 优化亚马逊Listing
router.post('/optimize', protect, checkFeatureAccess('amazon_listing'), async (req, res) => {
    try {
        const {
            currentTitle,
            currentBulletPoints,
            currentDescription,
            targetKeywords,
            optimizationGoals,
            outputLanguage
        } = req.body;

        // 确定特性条数
        const featureCount = Array.isArray(currentBulletPoints) ? currentBulletPoints.length : 5;
        
        // 根据选择的语言设置system消息
        const systemMessage = outputLanguage === 'en' 
            ? "You are a professional Amazon Listing optimizer. Please respond in English only."
            : "你是一个专业的亚马逊Listing优化专家，请只用中文回复。";
        
        // 构建提示词
        let prompt;
        if (outputLanguage === 'en') {
            prompt = `Optimize the following Amazon product listing to make it more attractive and effective.

Note: The content must be 100% relevant to the keywords provided. If a product category is mentioned, the features should be based on that category. The title should be between 150-200 characters, and each bullet point should not exceed 200 characters.

Current title: ${currentTitle}

Current bullet points:
${Array.isArray(currentBulletPoints) ? currentBulletPoints.join('\n') : currentBulletPoints}

Current product description:
${currentDescription || 'None'}

Keywords to add: ${targetKeywords || 'None'}

Optimization goals: ${optimizationGoals ? optimizationGoals.join(', ') : 'Search ranking, Conversion rate'}

Please return the optimized content in the following JSON format, with exactly ${featureCount} bullet points, no more, no less:
{
  "title": "Optimized title",
  "bulletPoints": [${Array(featureCount).fill('"Optimized feature description"').join(', ')}],
  "description": "Optimized product description"
}`;
        } else {
            prompt = `现在你是一个Listing创作员，你拥有极丰富的商品营销经验，请你优化以下亚马逊产品Listing，构建更加吸引眼球的商品Listing。

注意：其中要严谨围绕关键词展开编写创作，必须达到百分百的关键词相关性以及埋词率；当商品类目不为空时，商品特性则以商品类目的特性展开编写；标题长度在150-200个字符间，产品特性的每一条不超过200个字符。

当前标题: ${currentTitle}

当前产品特性:
${Array.isArray(currentBulletPoints) ? currentBulletPoints.join('\n') : currentBulletPoints}

当前产品描述:
${currentDescription || '无'}

需要添加的关键词: ${targetKeywords || '无'}

优化目标: ${optimizationGoals ? optimizationGoals.join(', ') : '搜索排名, 转化率'}

请按以下JSON格式返回优化后的内容，注意商品特性条数必须严格为${featureCount}条，不多不少:
{
  "title": "优化后的标题",
  "bulletPoints": [${Array(featureCount).fill('"优化后的特性描述"').join(', ')}],
  "description": "优化后的产品描述"
}`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 4000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`优化路由GLM-4原始响应: ${content}`);
            
            // 提取JSON部分 - 改进正则表达式以更精确地匹配JSON
            const jsonMatch = content.match(/(\{[\s\S]*?\})/g);
            
            if (jsonMatch && jsonMatch.length > 0) {
                // 尝试解析找到的第一个JSON对象
                try {
                    result = JSON.parse(jsonMatch[0]);
                } catch (innerError) {
                    // 如果解析失败，尝试清理JSON字符串后再解析
                    let cleanedJson = jsonMatch[0]
                        .replace(/[\u0000-\u001F]+/g, ' ')  // 移除控制字符
                        .replace(/,\s*}/g, '}')             // 修复尾部逗号
                        .replace(/,\s*]/g, ']');            // 修复数组尾部逗号
                    
                    logger.info(`优化路由尝试清理后的JSON: ${cleanedJson}`);
                    result = JSON.parse(cleanedJson);
                }
            } else {
                // 如果没有找到JSON格式，尝试构建一个基本结构
                logger.warn(`优化路由未找到JSON格式，尝试提取内容并构建结构`);
                
                // 分割内容以提取标题、产品特性和产品描述
                const lines = content.split('\n').filter(line => line.trim() !== '');
                
                // 尝试识别标题、产品特性和产品描述
                let title = '';
                let bulletPoints = [];
                let description = '';
                
                // 查找标题
                const titleMatch = content.match(/标题[：:]\s*(.*)/i) || content.match(/title[：:]\s*(.*)/i);
                if (titleMatch) title = titleMatch[1].trim();
                
                // 查找产品特性
                const bulletRegex = /[•\-\*]?\s*(.*)/g;
                let bulletMatches;
                let bulletSection = content.match(/产品特性[：:]([\s\S]*?)(?:产品描述[：:]|$)/i);
                
                if (bulletSection) {
                    while ((bulletMatches = bulletRegex.exec(bulletSection[1])) !== null) {
                        if (bulletMatches[1].trim().length > 0) {
                            bulletPoints.push(bulletMatches[1].trim());
                        }
                    }
                }
                
                // 如果没有找到足够的产品特性，尝试查找列表项
                if (bulletPoints.length < 5) {
                    const listItems = content.match(/[•\-\*]\s*(.*)/g);
                    if (listItems) {
                        bulletPoints = listItems.map(item => item.replace(/[•\-\*]\s*/, '').trim());
                    }
                }
                
                // 确保有指定数量的产品特性
                while (bulletPoints.length < featureCount) {
                    bulletPoints.push("产品特点" + (bulletPoints.length + 1));
                }
                
                // 如果超出了指定的数量，则截取
                if (bulletPoints.length > featureCount) {
                    bulletPoints = bulletPoints.slice(0, featureCount);
                }
                
                // 查找产品描述
                const descMatch = content.match(/产品描述[：:]([\s\S]*?)$/i) || content.match(/description[：:]([\s\S]*?)$/i);
                if (descMatch) description = descMatch[1].trim();
                
                result = {
                    title: title || "未能提取标题",
                    bulletPoints: bulletPoints,
                    description: description || "未能提取产品描述"
                };
            }
        } catch (parseError) {
            logger.error(`解析GLM-4优化响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`优化API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            return res.status(500).json({ 
                error: "解析API响应失败", 
                details: parseError.message,
                message: "服务器在处理AI优化响应时遇到问题，请稍后再试"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`优化亚马逊Listing失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "优化亚马逊Listing失败",
            details: error.message
        });
    }
});

// AI推荐关键词
router.post('/recommend-keywords', protect, checkFeatureAccess('amazon_keyword_recommender'), async (req, res) => {
    try {
        const { productCategory, outputLanguage } = req.body;

        if (!productCategory) {
            return res.status(400).json({
                success: false,
                error: "缺少商品类目参数"
            });
        }
        
        // 根据选择的语言设置system消息
        const systemMessage = outputLanguage === 'en' 
            ? "You are a professional Amazon SEO expert. Please respond in English only."
            : "你是一个专业的亚马逊SEO专家，请只用中文回复。";

        // 构建提示词
        let prompt;
        if (outputLanguage === 'en') {
            prompt = `Based on the following product category, recommend 10 keywords suitable for Amazon listings that can improve search ranking and conversion rate.
Product category: ${productCategory}

Please return only the keywords, separated by commas, without any other content.`;
        } else {
            prompt = `请根据以下商品类目，推荐10个适合亚马逊Listing的关键词，这些关键词应该能够提高商品的搜索排名和转化率。
商品类目: ${productCategory}

请直接返回关键词，用逗号分隔，不要包含其他内容。`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 500
        }, {
            headers: getAuthHeaders()
        });

        // 获取API响应
        const content = response.data.choices[0].message.content;
        
        // 清理响应内容，确保只返回关键词列表
        const keywords = content.replace(/^[\s\n]*|[\s\n]*$/g, '').split(',').map(kw => kw.trim()).join(',');

        // 返回结果
        res.json({
            success: true,
            keywords: keywords
        });

    } catch (error) {
        logger.error(`推荐关键词失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "推荐关键词失败",
            details: error.message
        });
    }
});

// 生成亚马逊后台搜索词
router.post('/generate-search-term', protect, checkFeatureAccess('amazon_search_term'), async (req, res) => {
    try {
        const {
            productKeywords,
            outputLanguage
        } = req.body;

        if (!productKeywords) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：商品名称或关键词"
            });
        }
        
        // 设置系统提示词
        const systemMessage = "你是一个亚马逊运营专家，现在请你学习下面知识并严格遵守其中的规则，根据我提供的产品信息，编写出一个优秀的亚马逊后台搜索词关键词(Search Term)。规则如下：1、Search Term是亚马逊后台中产品发布的一个关键词填写项，它的字符上限为250，你最终的输出一定不能超过250个字符；2、你可以根据你的认知分析我提供的商品信息中的名称、材料、功能、特点、互补产品、使用场所、附属产品、作为礼物的描述、与产品相关的量词词汇、潜在用户等用以编写Search Term，避免出现矛盾的描述，例如：羽毛球鞋，篮球鞋，这俩肯定是不能用来描述同一个商品的，还有例如我提供了中老年夹克，你输出中老年腮红，这肯定也是错误的，这两个完全是两个品类，并不属于附属产品；3、最后结果不能出现任何标点符号，使用空格代替所有的标点符号，包括连接符\"-\"；4、不要包含任何商品身份信息，比如品牌名称，商品名称，ASIN，UPC等，特别是品牌名称，你一定要仔细分析；5、不要提供不准确的，误导的，不相关的信息，比如错误的商品类目，错误的性别，不合时宜的词语等；6、不要使用主观性较强的关键词比如amazing，good quality，best selling等；7、可以加上单复数。考虑单复数搜索结果的不同，在条件允许的范畴下可以把单复数都融入进去；8、你要知道当前的日期以适应不同节日的消费情景与消费习惯，特别是可以作为节日礼物销售的产品。例如，一款文具在7-8月份开学季的时候销售，关键词就可以添加上相关的词或词组，例如，\"colors gel pens for term begins\"；9、不要重复关键词，尽可能填互补性词语。例如，你的产品是一款男士皮鞋，可能涉及的关键词包括一些修饰性的词语，如Man's Shoes, Leather Shoes, Formal Shoes, 那么，你可以合在一起写成Man's Formal Leather Shoes，这样可以节省字符数量；注意：你不着急答复，一定要严格学习上面的知识与规则后，仔细地进行思考，最后，请直接输出你编写的亚马逊后台搜索关键词(Search Term)，不进行任何解释和说明。";
        
        // 构建用户提示词
        let prompt;
        if (outputLanguage === 'en') {
            prompt = `Product information: ${productKeywords}

Please generate Amazon backend search terms (maximum 250 characters) in English.`;
        } else {
            prompt = `商品信息: ${productKeywords}

请生成中文的亚马逊后台搜索词(最多250个字符)。`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 1000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`搜索词生成原始响应: ${content}`);
            
            // 清理内容，直接使用返回的文本
            const searchTerm = content.trim();
            
            result = {
                searchTerm: searchTerm
            };
        } catch (parseError) {
            logger.error(`解析搜索词生成响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            return res.status(500).json({ 
                error: "解析API响应失败", 
                details: parseError.message,
                message: "服务器在处理AI响应时遇到问题，请稍后再试"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成亚马逊后台搜索词失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "生成亚马逊后台搜索词失败",
            details: error.message
        });
    }
});

// 分析亚马逊客户评论
router.post('/analyze-review', protect, checkFeatureAccess('amazon_review_analysis'), async (req, res) => {
    try {
        const {
            customerReview,
            outputLanguage
        } = req.body;

        if (!customerReview) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：客户评论内容"
            });
        }
        
        // 设置系统提示词
        const systemMessage = "现在你是一名资深的亚马逊卖家，现在需要你进行评论分析。你要给我返回如下几点内容：产品优缺点、客户情绪、客户需求、销售策略调整、答复客户模板。注意：你可以从客户的评价中精准的定位客户提出的优缺点，并细化优缺点；进行客观的情绪分析以及客户需求解析；答复客户模板要亲切的、就事论事的、口语化的进行答复；做出相应的销售策略整改计划，可以针对优缺点展开叙述，取长补短。";
        
        // 构建用户提示词
        let prompt;
        if (outputLanguage === 'en') {
            prompt = `Please analyze the following Amazon customer review and provide insights in English:

Customer Review: ${customerReview}

Please provide your analysis in the following format:

productProsCons: Detailed analysis of product pros and cons
customerEmotion: Analysis of customer's emotional state
customerNeeds: Analysis of customer's needs and expectations
salesStrategy: Recommended sales strategy adjustments
replyTemplate: A template to reply to this customer`;
        } else {
            prompt = `请分析以下亚马逊客户评论并提供见解：

客户评论: ${customerReview}

请按以下格式提供您的分析:

productProsCons: 产品优缺点的详细分析
customerEmotion: 客户情绪状态分析
customerNeeds: 客户需求和期望分析
salesStrategy: 推荐的销售策略调整
replyTemplate: 回复该客户的模板`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 2000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`客户评论分析原始响应: ${content}`);
            
            // 处理响应内容，提取各部分内容
            const productProsConsMatch = content.match(/productProsCons:\s*([\s\S]*?)(?=customerEmotion:|$)/i);
            const customerEmotionMatch = content.match(/customerEmotion:\s*([\s\S]*?)(?=customerNeeds:|$)/i);
            const customerNeedsMatch = content.match(/customerNeeds:\s*([\s\S]*?)(?=salesStrategy:|$)/i);
            const salesStrategyMatch = content.match(/salesStrategy:\s*([\s\S]*?)(?=replyTemplate:|$)/i);
            const replyTemplateMatch = content.match(/replyTemplate:\s*([\s\S]*?)$/i);
            
            result = {
                productProsCons: productProsConsMatch ? productProsConsMatch[1].trim() : "未能提取产品优缺点分析",
                customerEmotion: customerEmotionMatch ? customerEmotionMatch[1].trim() : "未能提取客户情绪分析",
                customerNeeds: customerNeedsMatch ? customerNeedsMatch[1].trim() : "未能提取客户需求分析",
                salesStrategy: salesStrategyMatch ? salesStrategyMatch[1].trim() : "未能提取销售策略建议",
                replyTemplate: replyTemplateMatch ? replyTemplateMatch[1].trim() : "未能提取回复模板"
            };
        } catch (parseError) {
            logger.error(`解析客户评论分析响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            return res.status(500).json({ 
                error: "解析API响应失败", 
                details: parseError.message,
                message: "服务器在处理AI响应时遇到问题，请稍后再试"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`分析亚马逊客户评论失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "分析亚马逊客户评论失败",
            details: error.message
        });
    }
});

// 亚马逊消费者洞察专家
router.post('/consumer-insights', protect, checkFeatureAccess('amazon_consumer_insights'), async (req, res) => {
    try {
        const {
            productCategory,
            targetMarket,
            outputLanguage
        } = req.body;

        if (!productCategory || !targetMarket) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：商品类目或销售市场/人群"
            });
        }
        
        // 根据选择的语言设置system消息
        const systemMessage = outputLanguage !== 'zh' 
            ? "You are an Amazon product comparison and evaluation expert. Task: Conduct in-depth comparison and analysis of two Amazon products. As an Amazon product comparison and evaluation expert, based on the product information provided, you will compare the products across various dimensions. Additionally, you will analyze the strengths and weaknesses of the products based on the comparison results, taking into account factors such as brand reputation and after-sales service, to provide an in-depth comparison and evaluation. You will also provide improvement and optimization suggestions for the user's product. Please output the comparison results in a table format where appropriate. IMPORTANT: You must respond in English only."
            : "你是一个亚马逊产品对比和评估专家。任务：进行两款亚马逊产品的深度对比和分析。作为一名亚马逊产品对比和评估专家，根据我给你的产品信息，对产品在各个维度进行对比。不仅如此，我还会根据对比结果，结合产品的品牌口碑、售后服务等因素，分析产品的优缺点，进行深度对比和评估。并对我的产品提出改进，优化建议。请以表格形式输出对比结果。重要：你必须只用中文回复，禁止使用英文。";
        
        // 构建用户提示词
        let prompt;
        if (outputLanguage !== 'zh') {
            prompt = `Please provide consumer insights for the following product category and target market in English:

Product Category: ${productCategory}
Target Market/Audience: ${targetMarket}

Please provide your analysis in the following format with clear structure and categories. Use EXACTLY the following section headers:

userPersona:
1. "Age Distribution":
- Age range: 25-45
- Specific demographic details

2. "Professional Background":
- Types of professionals
- Income levels

3. "Lifestyle":
- Living habits
- Preferences

usageScenarios:
IMPORTANT: Please provide AT LEAST 4-5 different usage scenarios with detailed descriptions.
1. "Work Environment":
- Office usage
- Remote work

2. "Health and Wellness":
- Fitness activities
- Health monitoring

3. "Travel":
- Usage while traveling
- Benefits during trips

4. "Home Use":
- Family applications
- Daily routines

painPoints:
IMPORTANT: Please provide AT LEAST 4-5 different pain points with detailed descriptions.
1. "Time Management":
- Specific issues
- Current solutions

2. "Usability Issues":
- Common frustrations
- Technical limitations

3. "Integration Problems":
- Compatibility issues
- Workflow disruptions

4. "Quality Concerns":
- Durability issues
- Performance problems

purchaseMotivations:
IMPORTANT: Please provide AT LEAST 4-5 different purchase motivations with detailed descriptions.
1. "Productivity Enhancement":
- How the product helps
- Key benefits

2. "Status and Image":
- Social perception
- Brand associations

3. "Problem Solving":
- Specific issues addressed
- Solutions provided

4. "Value for Money":
- Cost justification
- Long-term benefits

unmetNeeds:
IMPORTANT: Please provide AT LEAST 3-4 different unmet needs with detailed descriptions.
1. "Integration with Existing Systems":
- Current limitations
- Desired improvements

2. "Customization Options":
- Current constraints
- User preferences

3. "Support and Service":
- Existing gaps
- Expected improvements

IMPORTANT: Please use EXACTLY the section headers as shown above (userPersona, usageScenarios, painPoints, purchaseMotivations, unmetNeeds) to ensure proper parsing of your response.`;
        } else {
            prompt = `请为以下商品类目和目标市场/人群提供消费者洞察分析：

商品类目: ${productCategory}
目标市场/人群: ${targetMarket}

请严格按以下格式提供您的分析，结构和分类要清晰。请使用完全相同的章节标题：

userPersona:
1. "年龄分布":
- 年龄范围: 25-45岁
- 具体人口特征

2. "职业背景":
- 专业人士类型
- 收入水平

3. "生活方式":
- 生活习惯
- 偏好

usageScenarios:
重要提示：请至少提供4-5个不同的使用场景，并详细描述。
1. "工作环境":
- 办公室使用
- 远程工作

2. "健康与健身":
- 健身活动
- 健康监测

3. "旅行":
- 旅行中的使用
- 旅途中的好处

4. "家庭使用":
- 家庭应用
- 日常例行活动

painPoints:
重要提示：请至少提供4-5个不同的用户痛点，并详细描述。
1. "时间管理":
- 具体问题
- 当前解决方案

2. "易用性问题":
- 常见挫折
- 技术限制

3. "集成问题":
- 兼容性问题
- 工作流中断

4. "质量问题":
- 耐用性问题
- 性能问题

purchaseMotivations:
重要提示：请至少提供4-5个不同的购买动机，并详细描述。
1. "提升工作效率":
- 产品如何帮助
- 关键优势

2. "地位和形象":
- 社会认知
- 品牌关联

3. "问题解决":
- 解决的具体问题
- 提供的解决方案

4. "物有所值":
- 成本合理性
- 长期收益

unmetNeeds:
重要提示：请至少提供3-4个不同的未被满足的需求，并详细描述。
1. "与现有系统集成":
- 当前局限性
- 期望的改进

2. "定制化选项":
- 当前限制
- 用户偏好

3. "支持和服务":
- 现有差距
- 期望的改进

重要提示：请完全按照上面显示的章节标题（userPersona、usageScenarios、painPoints、purchaseMotivations、unmetNeeds）来组织您的回答，以确保正确解析您的响应。`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 4000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`消费者洞察分析原始响应: ${content}`);
            
            // 处理响应内容，提取各部分内容
            // 更新正则表达式以匹配多种可能的标题格式
            const userPersonaMatch = content.match(/(?:userPersona:|(?:User|用户)\s*Persona|(?:用户|User)画像)[\s\S]*?([\s\S]*?)(?=(?:usageScenarios:|(?:Usage|使用)\s*Scenarios|(?:产品|Product)使用场景|(?:Pain|用户)\s*Points|用户痛点|#{3,4}\s*(?:Usage|使用|Pain|用户)))/i);
            
            const usageScenariosMatch = content.match(/(?:usageScenarios:|(?:Usage|使用)\s*Scenarios|(?:产品|Product)使用场景)[\s\S]*?([\s\S]*?)(?=(?:painPoints:|(?:Pain|用户)\s*Points|用户痛点|#{3,4}\s*(?:Pain|用户|Purchase|购买)))/i);
            
            const painPointsMatch = content.match(/(?:painPoints:|(?:Pain|用户)\s*Points|用户痛点)[\s\S]*?([\s\S]*?)(?=(?:purchaseMotivations:|(?:Purchase|购买)\s*Motivations|购买动机|#{3,4}\s*(?:Purchase|购买|Unmet|未被)))/i);
            
            const purchaseMotivationsMatch = content.match(/(?:purchaseMotivations:|(?:Purchase|购买)\s*Motivations|购买动机)[\s\S]*?([\s\S]*?)(?=(?:unmetNeeds:|(?:Unmet|未被)\s*Needs|未被满足的需求|#{3,4}\s*(?:Unmet|未被|分析)))/i);
            
            const unmetNeedsMatch = content.match(/(?:unmetNeeds:|(?:Unmet|未被)\s*Needs|未被满足的需求)[\s\S]*?([\s\S]*?)(?:$|#{3,4}\s*分析)/i);
            
            // 如果没有匹配到结构化内容，尝试根据标题分段
            let userPersona = userPersonaMatch ? userPersonaMatch[1].trim() : "";
            let usageScenarios = usageScenariosMatch ? usageScenariosMatch[1].trim() : "";
            let painPoints = painPointsMatch ? painPointsMatch[1].trim() : "";
            let purchaseMotivations = purchaseMotivationsMatch ? purchaseMotivationsMatch[1].trim() : "";
            let unmetNeeds = unmetNeedsMatch ? unmetNeedsMatch[1].trim() : "";
            
            // 如果仍然没有匹配到，尝试按章节分割
            if (!userPersona && !usageScenarios && !painPoints && !purchaseMotivations && !unmetNeeds) {
                const sections = content.split(/#{3,4}\s+/);
                if (sections.length >= 5) {
                    // 假设内容按顺序排列：用户画像、使用场景、痛点、购买动机、未满足需求
                    for (let i = 0; i < sections.length; i++) {
                        const section = sections[i].trim();
                        if (section.match(/(?:User|用户)\s*Persona|(?:用户|User)画像/i)) {
                            userPersona = section.replace(/(?:User|用户)\s*Persona|(?:用户|User)画像/i, "").trim();
                        } else if (section.match(/(?:Usage|使用)\s*Scenarios|(?:产品|Product)使用场景/i)) {
                            usageScenarios = section.replace(/(?:Usage|使用)\s*Scenarios|(?:产品|Product)使用场景/i, "").trim();
                        } else if (section.match(/(?:Pain|用户)\s*Points|用户痛点/i)) {
                            painPoints = section.replace(/(?:Pain|用户)\s*Points|用户痛点/i, "").trim();
                        } else if (section.match(/(?:Purchase|购买)\s*Motivations|购买动机/i)) {
                            purchaseMotivations = section.replace(/(?:Purchase|购买)\s*Motivations|购买动机/i, "").trim();
                        } else if (section.match(/(?:Unmet|未被)\s*Needs|未被满足的需求/i)) {
                            unmetNeeds = section.replace(/(?:Unmet|未被)\s*Needs|未被满足的需求/i, "").trim();
                        }
                    }
                }
            }
            
            result = {
                userPersona: userPersona || "未能提取用户画像分析",
                usageScenarios: usageScenarios || "未能提取产品使用场景分析",
                painPoints: painPoints || "未能提取用户痛点分析",
                purchaseMotivations: purchaseMotivations || "未能提取购买动机分析",
                unmetNeeds: unmetNeeds || "未能提取未被满足需求分析"
            };
            
            // 记录提取结果
            logger.info(`消费者洞察分析提取结果: ${JSON.stringify(result)}`);
        } catch (parseError) {
            logger.error(`解析消费者洞察分析响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            return res.status(500).json({ 
                error: "解析API响应失败", 
                details: parseError.message,
                message: "服务器在处理AI响应时遇到问题，请稍后再试"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成消费者洞察分析失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "生成消费者洞察分析失败",
            details: error.message
        });
    }
});

// 亚马逊客户邮件回复
router.post('/customer-email', protect, checkFeatureAccess('amazon_customer_email'), async (req, res) => {
    try {
        const {
            customerEmail,
            replyContent,
            customerName,
            serviceName,
            outputLanguage
        } = req.body;

        if (!customerEmail) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：客户邮件内容"
            });
        }
        
        // 设置系统提示词
        const systemMessage = "你是一个资深的客服人员，要求根据我提供客户邮件内容以及我要答复的大概内容编写一篇回复邮件。对于正面和中性情绪的邮件，感谢用户的邮件；对于负面情绪的邮件（如投诉），进行道歉并且引导至客服。可以提供回复的主要内容，如进行交叉销售，以及提出赔偿方案。注意：如果我有提供客户名字和客服名字，你必须使用我提供的客户名字以及客服名字作为收信人和落款人。";
        
        // 构建用户提示词
        let prompt;
        if (outputLanguage === 'en') {
            prompt = `Please analyze the following customer email and generate a professional response according to the system instructions:

Customer Email: ${customerEmail}

${replyContent ? `Content to include in the reply: ${replyContent}` : ''}
${customerName ? `Customer Name: ${customerName}` : ''}
${serviceName ? `Customer Service Representative Name: ${serviceName}` : ''}

Please provide your response in the following format:

customerEmotion: Brief analysis of the customer's emotional state (positive, neutral, or negative) and main concerns
emailReply: The complete email response to the customer (use the customer name as recipient and service representative name as signature if provided)
suggestion: Suggestions for further handling of this case, including potential cross-selling opportunities or compensation options if applicable`;
        } else {
            prompt = `请分析以下客户邮件并根据系统指示生成专业回复：

客户邮件内容: ${customerEmail}

${replyContent ? `需要在回复中包含的内容: ${replyContent}` : ''}
${customerName ? `客户名字: ${customerName}` : ''}
${serviceName ? `客服名字: ${serviceName}` : ''}

请按以下格式提供您的回复:

customerEmotion: 简要分析客户的情绪状态（正面、中性或负面）和主要关注点
emailReply: 给客户的完整邮件回复（如果提供了客户名字和客服名字，请分别用作收信人和落款人）
suggestion: 对此案例的进一步处理建议，包括可能的交叉销售机会或赔偿方案（如适用）`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 4000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`客户邮件回复原始响应: ${content}`);
            
            // 处理响应内容，提取各部分内容
            const customerEmotionMatch = content.match(/customerEmotion:\s*([\s\S]*?)(?=emailReply:|$)/i);
            const emailReplyMatch = content.match(/emailReply:\s*([\s\S]*?)(?=suggestion:|$)/i);
            const suggestionMatch = content.match(/suggestion:\s*([\s\S]*?)$/i);
            
            // 如果没有匹配到结构化内容，尝试其他匹配方式
            let customerEmotion = customerEmotionMatch ? customerEmotionMatch[1].trim() : "";
            let emailReply = emailReplyMatch ? emailReplyMatch[1].trim() : "";
            let suggestion = suggestionMatch ? suggestionMatch[1].trim() : "";
            
            // 如果仍然没有匹配到，尝试按段落分割
            if (!customerEmotion && !emailReply && !suggestion) {
                const paragraphs = content.split(/\n\n+/);
                if (paragraphs.length >= 3) {
                    // 假设内容按顺序排列：情绪分析、邮件回复、处理建议
                    customerEmotion = paragraphs[0].trim();
                    emailReply = paragraphs[1].trim();
                    suggestion = paragraphs[2].trim();
                }
            }
            
            result = {
                customerEmotion: customerEmotion || "未能提取客户情绪分析",
                emailReply: emailReply || "未能提取邮件回复内容",
                suggestion: suggestion || "未能提取处理建议"
            };
            
            // 记录提取结果
            logger.info(`客户邮件回复提取结果: ${JSON.stringify(result)}`);
        } catch (parseError) {
            logger.error(`解析客户邮件回复响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            return res.status(500).json({ 
                error: "解析API响应失败", 
                details: parseError.message,
                message: "服务器在处理AI响应时遇到问题，请稍后再试"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成客户邮件回复失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "生成客户邮件回复失败",
            details: error.message
        });
    }
});

// FBA索赔邮件
router.post('/fba-claim', protect, checkFeatureAccess('fba_claim_email'), async (req, res) => {
    try {
        const {
            orderIssue,
            orderNumber,
            skuInfo,
            outputLanguage
        } = req.body;

        // 记录输出语言参数
        logger.info(`FBA索赔邮件请求的输出语言: ${outputLanguage}`);

        if (!orderIssue) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：订单问题描述"
            });
        }
        
        // 根据选择的语言设置system消息
        const systemMessage = outputLanguage !== 'zh' 
            ? "As an Amazon top operations expert, you are proficient in Amazon's policies and rules, and familiar with techniques for communicating with Amazon customer service. Now I need you to write an FBA claim email as a seller based on the order issue description. Here are the requirements for this email: 1. Be polite 2. Ensure a high success rate for the claim. Please respond in English only."
            : "作为一个亚马逊顶级运营专家，你精通亚马逊的各项政策和规则要求，并熟悉与亚马逊客服沟通的技巧。现在我需要你以卖家身份根据订单的问题描述撰写一封FBA索赔邮件。以下是这封邮件的要求:\n1.保持礼貌\n2.保障索赔成功率\n请只用中文回复，不要使用任何英文。";
        
        // 构建用户提示词
        let prompt;
        if (outputLanguage !== 'zh') {
            prompt = `Please generate a professional FBA claim email based on the following information:

Order Issue Description: ${orderIssue}
${orderNumber ? `Order Number: ${orderNumber}` : ''}
${skuInfo ? `SKU Information: ${skuInfo}` : ''}

Please provide your response in the following format:

claimEmail: The complete FBA claim email that I can send to Amazon (include all necessary information such as order details, problem description, and specific claim request)
claimTips: Practical tips and suggestions to increase the chances of a successful claim (including what evidence to attach, follow-up actions, etc.)`;
        } else {
            prompt = `请根据以下信息生成一封专业的FBA索赔邮件：

订单问题描述: ${orderIssue}
${orderNumber ? `订单号: ${orderNumber}` : ''}
${skuInfo ? `SKU信息: ${skuInfo}` : ''}

请按以下格式提供您的回复:

claimEmail: 完整的FBA索赔邮件内容，可直接发送给亚马逊（包含所有必要信息，如订单详情、问题描述和具体索赔请求）
claimTips: 提高索赔成功率的实用建议（包括应附加哪些证据、后续跟进行动等）

请注意：请只用中文回复，邮件内容也必须是中文。`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 4000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`FBA索赔邮件原始响应: ${content}`);
            
            // 处理响应内容，提取各部分内容
            const claimEmailMatch = content.match(/claimEmail:\s*([\s\S]*?)(?=claimTips:|$)/i);
            const claimTipsMatch = content.match(/claimTips:\s*([\s\S]*?)$/i);
            
            // 如果没有匹配到结构化内容，尝试其他匹配方式
            let claimEmail = claimEmailMatch ? claimEmailMatch[1].trim() : "";
            let claimTips = claimTipsMatch ? claimTipsMatch[1].trim() : "";
            
            // 如果仍然没有匹配到，尝试按段落分割
            if (!claimEmail && !claimTips) {
                const paragraphs = content.split(/\n\n+/);
                if (paragraphs.length >= 2) {
                    // 假设内容按顺序排列：索赔邮件、索赔建议
                    claimEmail = paragraphs[0].trim();
                    claimTips = paragraphs.slice(1).join("\n\n").trim();
                }
            }
            
            result = {
                claimEmail: claimEmail || "未能生成索赔邮件内容",
                claimTips: claimTips || "未能提供索赔建议"
            };
            
            // 记录提取结果
            logger.info(`FBA索赔邮件提取结果: ${JSON.stringify(result)}`);
        } catch (parseError) {
            logger.error(`解析FBA索赔邮件响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            return res.status(500).json({ 
                error: "解析API响应失败", 
                details: parseError.message,
                message: "服务器在处理AI响应时遇到问题，请稍后再试"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成FBA索赔邮件失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "生成FBA索赔邮件失败",
            details: error.message
        });
    }
});

// 产品对比
router.post('/product-comparison', protect, checkFeatureAccess('product_comparison'), async (req, res) => {
    try {
        const {
            yourProduct,
            competitorProduct,
            focusPoints,
            outputLanguage
        } = req.body;

        // 记录输出语言参数
        logger.info(`产品对比请求的输出语言: ${outputLanguage}`);

        if (!yourProduct || !competitorProduct) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：产品信息"
            });
        }
        
        // 根据选择的语言设置system消息
        const systemMessage = outputLanguage !== 'zh' 
            ? "You are an Amazon product comparison and evaluation expert. Task: Conduct in-depth comparison and analysis of two Amazon products. As an Amazon product comparison and evaluation expert, based on the product information provided, you will compare the products across various dimensions. Additionally, you will analyze the strengths and weaknesses of the products based on the comparison results, taking into account factors such as brand reputation and after-sales service, to provide an in-depth comparison and evaluation. You will also provide improvement and optimization suggestions for the user's product. Please output the comparison results in a table format where appropriate. IMPORTANT: You must respond in English only."
            : "你是一个亚马逊产品对比和评估专家。任务：进行两款亚马逊产品的深度对比和分析。作为一名亚马逊产品对比和评估专家，根据我给你的产品信息，对产品在各个维度进行对比。不仅如此，我还会根据对比结果，结合产品的品牌口碑、售后服务等因素，分析产品的优缺点，进行深度对比和评估。并对我的产品提出改进，优化建议。请以表格形式输出对比结果。重要：你必须只用中文回复，禁止使用英文。";
        
        // 构建用户提示词
        let prompt;
        if (outputLanguage !== 'zh') {
            prompt = `Please compare the following two products and provide a detailed analysis IN ENGLISH ONLY:

Your Product: ${yourProduct}
Competitor Product: ${competitorProduct}
${focusPoints ? `Focus Points for Comparison: ${focusPoints}` : ''}

Please provide your analysis in the following format:

1. featureComparison: A detailed comparison of the features, specifications, and characteristics of both products in a clear, organized manner. IMPORTANT: Present this comparison in an HTML table format with clear headers and rows comparing different aspects.

2. strengthsWeaknesses: An analysis of the strengths and weaknesses of your product compared to the competitor product. IMPORTANT: Present this analysis in an HTML table format with two columns (Your Product vs Competitor) and rows for different aspects.

3. improvementSuggestions: Practical suggestions for improving your product based on the comparison. IMPORTANT: Present these suggestions in a numbered HTML list format.

CRITICAL: All tables must be properly formatted with <table>, <tr>, <th>, and <td> HTML tags. Ensure proper table structure with headers and organized rows.
YOU MUST RESPOND IN ENGLISH ONLY.`;
        } else {
            prompt = `请对比以下两个产品并提供详细分析，必须只用中文回复：

您的产品: ${yourProduct}
竞品产品: ${competitorProduct}
${focusPoints ? `特别关注的对比点: ${focusPoints}` : ''}

请按以下格式提供您的分析:

1. featureComparison: 详细对比两个产品的特性、规格和特点，以清晰、有条理的方式呈现。重要：必须使用HTML表格格式呈现，包含清晰的表头和行，对比不同方面的特性。

2. strengthsWeaknesses: 分析您的产品与竞品相比的优势和劣势。重要：必须使用HTML表格格式呈现，设置两列（您的产品 vs 竞品）和多行不同方面的对比。

3. improvementSuggestions: 基于对比分析，为您的产品提供实用的改进建议。重要：必须使用HTML编号列表格式呈现这些建议。

关键要求：所有表格必须使用正确的HTML标签格式化，包括<table>、<tr>、<th>和<td>标签。确保表格结构合理，有表头和组织良好的行。
注意：你必须只用中文回复，所有表格内容、标题和文本都必须是中文。`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 4000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`产品对比原始响应: ${content.substring(0, 200)}...`); // 只记录前200个字符
            
            // 处理响应内容，提取各部分内容，保留HTML标签
            // 使用更宽松的匹配模式，以适应不同的格式
            const featureComparisonMatch = content.match(/(?:featureComparison|feature comparison|产品特性对比|产品对比|特性对比)[:：]?\s*([\s\S]*?)(?=(?:strengthsWeaknesses|strengths and weaknesses|优劣势分析|优缺点分析|strengths|weaknesses)[:：]|$)/i);
            
            const strengthsWeaknessesMatch = content.match(/(?:strengthsWeaknesses|strengths and weaknesses|优劣势分析|优缺点分析|strengths|weaknesses)[:：]?\s*([\s\S]*?)(?=(?:improvementSuggestions|improvement suggestions|改进建议|优化建议|suggestions)[:：]|$)/i);
            
            const improvementSuggestionsMatch = content.match(/(?:improvementSuggestions|improvement suggestions|改进建议|优化建议|suggestions)[:：]?\s*([\s\S]*?)$/i);
            
            // 提取内容，保留HTML标签
            let featureComparison = featureComparisonMatch && featureComparisonMatch[1] ? featureComparisonMatch[1].trim() : "";
            let strengthsWeaknesses = strengthsWeaknessesMatch && strengthsWeaknessesMatch[1] ? strengthsWeaknessesMatch[1].trim() : "";
            let improvementSuggestions = improvementSuggestionsMatch && improvementSuggestionsMatch[1] ? improvementSuggestionsMatch[1].trim() : "";
            
            // 如果没有匹配到结构化内容，尝试查找表格和列表
            if (!featureComparison && !strengthsWeaknesses && !improvementSuggestions) {
                logger.warn(`未能提取结构化内容，尝试查找表格和列表`);
                
                // 查找所有表格
                const tables = content.match(/<table[\s\S]*?<\/table>/gi) || [];
                
                // 查找所有有序列表
                const lists = content.match(/<ol[\s\S]*?<\/ol>/gi) || [];
                
                // 如果找到至少两个表格，假设第一个是特性对比，第二个是优劣势分析
                if (tables.length >= 2) {
                    featureComparison = tables[0];
                    strengthsWeaknesses = tables[1];
                } else if (tables.length === 1) {
                    // 如果只有一个表格，假设是特性对比
                    featureComparison = tables[0];
                }
                
                // 如果找到列表，假设它是改进建议
                if (lists.length > 0) {
                    improvementSuggestions = lists[0];
                } else if (tables.length > 2) {
                    // 如果有第三个表格但没有列表，可能第三个表格就是改进建议
                    improvementSuggestions = tables[2];
                }
            }
            
            // 如果仍然没有内容，尝试按段落分割
            if (!featureComparison && !strengthsWeaknesses && !improvementSuggestions) {
                logger.warn(`未能找到表格和列表，尝试按段落分割内容`);
                
                const paragraphs = content.split(/\n\n+/);
                if (paragraphs.length >= 3) {
                    // 假设内容按顺序排列：特性对比、优劣势分析、改进建议
                    featureComparison = paragraphs[0];
                    strengthsWeaknesses = paragraphs[1];
                    improvementSuggestions = paragraphs[2];
                } else {
                    // 如果段落不够，使用全部内容作为特性对比
                featureComparison = content;
                }
            }
            
            // 检查语言匹配 - 如果用户选择中文但内容是英文，需要翻译
            if (outputLanguage === 'zh') {
                // 简单检测是否包含中文字符
                const containsChinese = /[\u4e00-\u9fa5]/.test(featureComparison + strengthsWeaknesses + improvementSuggestions);
                
                if (!containsChinese) {
                    logger.warn(`检测到英文内容但用户要求中文输出，尝试翻译...`);
                    
                    // 翻译系统提示词
                    const translateSystemPrompt = "你是一个专业的翻译，需要将英文内容翻译成流畅自然的中文。保留所有HTML标签和格式，只翻译文本内容。";
                    
                    // 尝试翻译特性对比
                    if (featureComparison) {
                        try {
                            const featureTranslateResponse = await axios.post(GLM4_API_URL, {
                                model: "GLM-4-Plus",
                                messages: [
                                    {
                                        role: "system",
                                        content: translateSystemPrompt
                                    },
                                    {
                                        role: "user",
                                        content: `请将以下HTML表格内容从英文翻译成中文，保留所有HTML标签：\n\n${featureComparison}`
                                    }
                                ],
                                temperature: 0.3, // 翻译使用较低的temperature
                                max_tokens: 2000
                            }, {
                                headers: getAuthHeaders()
                            });
                            
                            featureComparison = featureTranslateResponse.data.choices[0].message.content;
                        } catch (translateError) {
                            logger.error(`翻译特性对比失败: ${translateError.message}`);
                        }
                    }
                    
                    // 尝试翻译优劣势分析
                    if (strengthsWeaknesses) {
                        try {
                            const strengthsTranslateResponse = await axios.post(GLM4_API_URL, {
                                model: "GLM-4-Plus",
                                messages: [
                                    {
                                        role: "system",
                                        content: translateSystemPrompt
                                    },
                                    {
                                        role: "user",
                                        content: `请将以下HTML表格内容从英文翻译成中文，保留所有HTML标签：\n\n${strengthsWeaknesses}`
                                    }
                                ],
                                temperature: 0.3,
                                max_tokens: 2000
                            }, {
                                headers: getAuthHeaders()
                            });
                            
                            strengthsWeaknesses = strengthsTranslateResponse.data.choices[0].message.content;
                        } catch (translateError) {
                            logger.error(`翻译优劣势分析失败: ${translateError.message}`);
                        }
                    }
                    
                    // 尝试翻译改进建议
                    if (improvementSuggestions) {
                        try {
                            const suggestionsTranslateResponse = await axios.post(GLM4_API_URL, {
                                model: "GLM-4-Plus",
                                messages: [
                                    {
                                        role: "system",
                                        content: translateSystemPrompt
                                    },
                                    {
                                        role: "user",
                                        content: `请将以下HTML列表内容从英文翻译成中文，保留所有HTML标签：\n\n${improvementSuggestions}`
                                    }
                                ],
                                temperature: 0.3,
                                max_tokens: 2000
                            }, {
                                headers: getAuthHeaders()
                            });
                            
                            improvementSuggestions = suggestionsTranslateResponse.data.choices[0].message.content;
                        } catch (translateError) {
                            logger.error(`翻译改进建议失败: ${translateError.message}`);
                        }
                    }
                    
                    logger.info(`翻译完成`);
                }
            }
            
            result = {
                featureComparison: featureComparison || (outputLanguage === 'zh' ? "<p>未能提取产品特性对比</p>" : "<p>Failed to extract product feature comparison</p>"),
                strengthsWeaknesses: strengthsWeaknesses || (outputLanguage === 'zh' ? "<p>未能提取优劣势分析</p>" : "<p>Failed to extract strengths and weaknesses analysis</p>"),
                improvementSuggestions: improvementSuggestions || (outputLanguage === 'zh' ? "<p>未能提供改进建议</p>" : "<p>Failed to provide improvement suggestions</p>")
            };
            
            // 记录提取结果的长度，避免日志过大
            logger.info(`产品对比提取结果长度: featureComparison=${featureComparison.length}, strengthsWeaknesses=${strengthsWeaknesses.length}, improvementSuggestions=${improvementSuggestions.length}`);
        } catch (parseError) {
            logger.error(`解析产品对比响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            return res.status(500).json({ 
                error: "解析API响应失败", 
                details: parseError.message,
                message: "服务器在处理AI响应时遇到问题，请稍后再试"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成产品对比失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "生成产品对比失败",
            details: error.message
        });
    }
});

// 亚马逊评论生成
router.post('/review-generator', protect, checkFeatureAccess('amazon_review_generator'), async (req, res) => {
    try {
        const {
            productName,
            brandName,
            productDescription,
            reviewCount,
            outputLanguage
        } = req.body;

        // 记录输出语言参数
        logger.info(`亚马逊评论生成请求的输出语言: ${outputLanguage}`);

        if (!productName || !brandName) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：产品名称或品牌"
            });
        }
        
        // 设置系统提示词
        const systemMessage = "你是一个热心且细心的亚马逊购物者，我需要你根据我提供的产品信息和例子，帮我生成产品好评。评论要真实自然，像真正的消费者写的，包含具体使用体验和细节，突出产品优点。每条评论应包含标题和内容两部分。";
        
        // 构建用户提示词
        let prompt;
        if (outputLanguage !== 'zh') {
            prompt = `Please generate ${reviewCount || 5} positive Amazon reviews for the following product in English:

Product Name: ${productName}
Brand: ${brandName}
${productDescription ? `Product Description: ${productDescription}` : ''}

Please provide your response in the following JSON format:
{
  "reviews": [
    {
      "title": "Review title here",
      "content": "Detailed review content here",
      "username": "Random username here"
    },
    ...more reviews
  ]
}

Guidelines for the reviews:
1. Each review should sound natural and authentic, as if written by real customers
2. Include specific details about product features and benefits
3. Mention personal experiences and use cases
4. Vary the writing style and length for each review
5. All reviews should be positive (4-5 stars)`;
        } else {
            prompt = `请为以下产品生成${reviewCount || 5}条亚马逊好评：

产品名称: ${productName}
品牌: ${brandName}
${productDescription ? `产品描述: ${productDescription}` : ''}

请按以下JSON格式提供您的回复:
{
  "reviews": [
    {
      "title": "评论标题",
      "content": "详细评论内容",
      "username": "随机用户名"
    },
    ...更多评论
  ]
}

评论指南:
1. 每条评论应该听起来自然真实，就像真实客户写的一样
2. 包含产品特性和优点的具体细节
3. 提及个人使用体验和使用场景
4. 每条评论的写作风格和长度应有所不同
5. 所有评论都应该是正面的(4-5星)`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 4000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`亚马逊评论生成原始响应: ${content}`);
            
            // 提取JSON部分 - 改进正则表达式，处理```json标记
            let jsonContent = content;
            
            // 如果内容被```json包裹，提取内部内容
            const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonBlockMatch && jsonBlockMatch[1]) {
                jsonContent = jsonBlockMatch[1].trim();
            }
            
            try {
                // 直接尝试解析整个内容
                result = JSON.parse(jsonContent);
            } catch (parseError) {
                // 如果直接解析失败，尝试使用正则表达式提取JSON对象
                const jsonMatch = jsonContent.match(/(\{[\s\S]*\})/);
                
                if (jsonMatch && jsonMatch[1]) {
                    // 清理JSON字符串
                    let cleanedJson = jsonMatch[1]
                        .replace(/[\u0000-\u001F]+/g, ' ')  // 移除控制字符
                        .replace(/,\s*}/g, '}')             // 修复尾部逗号
                        .replace(/,\s*]/g, ']')             // 修复数组尾部逗号
                        .replace(/([^\\])\\n/g, '$1\\\\n')  // 修复换行符
                        .replace(/([^\\])\\r/g, '$1\\\\r')  // 修复回车符
                        .replace(/([^\\])\\t/g, '$1\\\\t'); // 修复制表符
                    
                    logger.info(`尝试清理后的JSON: ${cleanedJson}`);
                    
                    try {
                        result = JSON.parse(cleanedJson);
                    } catch (innerError) {
                        // 如果仍然解析失败，尝试从内容中提取标题和正文
                        logger.warn(`JSON解析失败，尝试从内容中提取标题和正文`);
                        
                        // 尝试提取标题和内容
                        const titleMatch = content.match(/[""]title[""]:\s*[""]([^""]+)[""]/);
                        const contentMatch = content.match(/[""]content[""]:\s*[""]([^""]+)[""]/);
                        
                        result = {
                            title: titleMatch ? titleMatch[1] : productName,
                            content: contentMatch ? contentMatch[1] : content
                        };
                    }
                } else {
                    // 如果没有找到JSON格式，尝试分析内容提取标题和正文
                    logger.warn(`未找到JSON格式，尝试分析内容提取标题和正文`);
                    
                    // 尝试通过段落分割提取标题和内容
                    const paragraphs = content.split(/\n\n+/);
                    if (paragraphs.length >= 2) {
                        result = {
                            title: paragraphs[0].replace(/^[#\s]*/, '').trim(),
                            content: paragraphs.slice(1).join('\n\n').trim()
                        };
                    } else {
                        result = {
                            title: productName,
                            content: content.trim()
                        };
                    }
                }
            }
            
            // 确保结果包含标题和内容
            if (!result.title) {
                result.title = productName;
            }
            
            // 设置语言变量
            const language = outputLanguage === 'en' ? 'en' : 'zh';
            
            if (!result.content) {
                result.content = language === 'en'
                    ? "Content generation failed. Please try again with more specific keywords."
                    : "内容生成失败。请尝试使用更具体的关键词再次尝试。";
            }
            
            // 验证语言匹配 - 检查是否符合所选语言
            const isChinese = /[\u4e00-\u9fa5]/.test(result.title + result.content);
            const contentLanguageMatches = (language === 'zh' && isChinese) || (language === 'en' && !isChinese);
            
            // 如果语言不匹配，尝试进行翻译
            if (!contentLanguageMatches) {
                logger.warn(`检测到内容语言(${isChinese ? '中文' : '英文'})与选择的语言(${language})不匹配，尝试转换`);
                
                // 构建转换提示
                const translateSystemPrompt = language === 'en' 
                    ? "You are a translator. Your task is to translate the provided Chinese content into English. Keep the style and formatting consistent, but ensure the output is natural English."
                    : "你是一名翻译。你的任务是将提供的英文内容翻译成中文。保持风格和格式一致，但确保输出是自然流畅的中文。";
                
                const translatePrompt = language === 'en'
                    ? `Translate the following Amazon Post from Chinese to English. Maintain the same marketing style and format, but ensure it's in natural English:

Title: ${result.title}
Content: ${result.content}

Return the translation in JSON format:
{
  "title": "Translated title in English",
  "content": "Translated content in English"
}`
                    : `将以下亚马逊Post从英文翻译成中文。保持相同的营销风格和格式，但确保是自然流畅的中文：

标题: ${result.title}
内容: ${result.content}

以JSON格式返回翻译：
{
  "title": "中文翻译的标题",
  "content": "中文翻译的内容"
}`;
                
                try {
                    // 调用翻译API
                    const translateResponse = await axios.post(GLM4_API_URL, {
                        model: "GLM-4-Plus",
                        messages: [
                            {
                                role: "system",
                                content: translateSystemPrompt
                            },
                            {
                                role: "user",
                                content: translatePrompt
                            }
                        ],
                        temperature: 0.3, // 翻译使用较低的temperature确保准确性
                        top_p: 0.9,
                        max_tokens: 2000
                    }, {
                        headers: getAuthHeaders()
                    });
                    
                    const translateContent = translateResponse.data.choices[0].message.content;
                    logger.info(`翻译响应: ${translateContent}`);
                    
                    // 提取JSON
                    const translateJsonMatch = translateContent.match(/```(?:json)?\s*([\s\S]*?)```/) || translateContent.match(/(\{[\s\S]*\})/);
                    if (translateJsonMatch && translateJsonMatch[1]) {
                        try {
                            const translatedResult = JSON.parse(translateJsonMatch[1].trim());
                            
                            // 检查翻译结果是否符合目标语言
                            const translatedIsChinese = /[\u4e00-\u9fa5]/.test(translatedResult.title + translatedResult.content);
                            const translationMatches = (language === 'zh' && translatedIsChinese) || (language === 'en' && !translatedIsChinese);
                            
                            if (translationMatches) {
                                // 翻译成功，更新结果
                                result = translatedResult;
                                logger.info(`成功转换为${language === 'zh' ? '中文' : '英文'}内容`);
                            }
                        } catch (parseError) {
                            logger.error(`解析翻译JSON失败: ${parseError.message}`);
                        }
                    }
                } catch (translateError) {
                    logger.error(`翻译内容失败: ${translateError.message}`);
                }
                
                // 如果翻译失败但是用户要求中文，强制使用中文模板
                if (language === 'zh' && !/[\u4e00-\u9fa5]/.test(result.title + result.content)) {
                    logger.warn(`翻译失败，使用备用中文模板`);
                    result = {
                        title: `【${productName}】优质产品推荐`,
                        content: `为您推荐这款优质产品，结合了${productName}的所有优点。这款产品设计精良，功能强大，将为您带来出色的使用体验。它不仅美观大方，而且实用耐用，是您的理想之选。欢迎选购！`
                    };
                }
                
                // 如果翻译失败但是用户要求英文，强制使用英文模板
                if (language === 'en' && /[\u4e00-\u9fa5]/.test(result.title + result.content)) {
                    logger.warn(`翻译失败，使用备用英文模板`);
                    result = {
                        title: `[${productName}] Premium Product Recommendation`,
                        content: `We recommend this premium product that combines all the advantages of ${productName}. This product is well-designed, powerful, and will bring you an excellent user experience. It's not only beautiful but also practical and durable, making it your ideal choice. Welcome to purchase!`
                    };
                }
            }
            
        } catch (parseError) {
            logger.error(`解析Post生成响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            // 提供默认响应，确保语言正确
            result = {
                title: language === 'en' 
                    ? `[${productName}] Product Post` 
                    : `【${productName}】产品推荐`,
                content: language === 'en'
                    ? `Check out this amazing product featuring ${productName}. It offers great value and excellent performance.`
                    : `推荐这款出色的产品，包含${productName}特性。它提供了很高的性价比和出色的性能表现。`
            };
            
            return res.status(200).json({ 
                success: true,
                data: result,
                message: "生成过程中遇到问题，返回默认内容"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成亚马逊Post内容失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        
        // 提供默认响应，确保语言正确
        const language = req.body.outputLanguage === 'en' ? 'en' : 'zh';
        const defaultResult = {
            title: language === 'en' 
                ? `[${productName || 'Product'}] Amazon Post` 
                : `【${productName || '产品'}】亚马逊推荐`,
            content: language === 'en'
                ? `This is a default post content due to generation error. Please try again later.`
                : `由于生成错误，这是默认的帖子内容。请稍后再试。`
        };
        
        res.status(200).json({
            success: true,
            data: defaultResult,
            error: "生成过程中出现错误，返回默认内容"
        });
    }
});

// 辅助函数：生成随机用户名
function generateRandomUsername(isEnglish) {
    const englishFirstNames = ['John', 'Mary', 'David', 'Sarah', 'Michael', 'Jennifer', 'Robert', 'Lisa', 'William', 'Elizabeth', 'James', 'Susan', 'Thomas', 'Karen', 'Daniel', 'Nancy'];
    const chineseNames = ['张三', '李四', '王五', '赵六', '刘七', '孙八', '周九', '吴十', '郑明', '钱亮', '孙芳', '李梅', '王花', '赵云', '钱多多', '孙乐乐'];
    
    if (isEnglish) {
        const firstName = englishFirstNames[Math.floor(Math.random() * englishFirstNames.length)];
        const lastInitial = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        return `${firstName} ${lastInitial}.`;
                        } else {
        return chineseNames[Math.floor(Math.random() * chineseNames.length)];
    }
}

// 亚马逊评论回复
router.post('/review-response', protect, checkFeatureAccess('amazon_review_response'), async (req, res) => {
    try {
        const {
            reviewContent,
            brandName
        } = req.body;

        logger.info(`亚马逊评论回复请求，品牌名称: ${brandName || '未提供'}`);

        if (!reviewContent) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：评论内容"
            });
        }
        
        // 设置系统提示词
        const systemMessage = "作为一个乐于助人的客服代表，你的任务是对客户的评论进行答复。你需要始终保持友好、专业且解决问题的态度，无论评论正面还是负面。在这个任务中，你需要回应一个亚马逊产品的评论。评论内容将作为输入，你需要考虑评论的内容，然后提出一个富有同情心且解决问题的回复。回复应该是友好的，表示对评论者的尊重，并针对他们的问题或反馈提供明确的解答或者解决方案。";
        
        // 构建用户提示词
        const prompt = `请阅读并理解以下客户评论，然后进行友好且专业的回复。
尝试解决评论中提出的问题或关注点，或者至少表达你的理解和同情。
如果评论是正面的，感谢评论者并表达对他们的认可。如果评论是负面的，表达歉意并提供解决问题的建议或方案。

客户评论：
"${reviewContent}"

${brandName ? `品牌名称：${brandName}` : ''}

请直接回复这条评论，不需要附加其他说明，也不需要以JSON格式回复，只需要直接提供回复内容。`;

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 2000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        const content = response.data.choices[0].message.content.trim();
        logger.info(`亚马逊评论回复原始响应: ${content}`);
        
        // 返回结果
        res.json({
            success: true,
            data: {
                response: content
            }
        });

    } catch (error) {
        logger.error(`生成亚马逊评论回复失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "生成亚马逊评论回复失败",
            details: error.message
        });
    }
});

// 亚马逊关键词推荐
router.post('/keyword-recommender', protect, checkFeatureAccess('amazon_keyword_recommender'), async (req, res) => {
    try {
        const {
            productDescription,
            outputLanguage
        } = req.body;

        logger.info(`亚马逊关键词推荐请求，输出语言: ${outputLanguage || 'zh'}`);

        if (!productDescription) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：产品描述"
            });
        }
        
        // 设置语言，默认为中文
        const language = outputLanguage === 'en' ? 'en' : 'zh';
        
        // 根据选择的语言设置system消息
        const systemMessage = language === 'en' 
            ? "You are an Amazon popular keyword assistant. You MUST generate 30 popular Amazon keywords (modified nouns) based on ALL the product information I provide. Example: If the product is an ultra-lightweight electric bicycle, your output should be like: 1. Portable electric bicycle; 2. Lightweight electric bicycle; 3. Stylish electric bicycle. ONLY output the keywords, one per line, numbered from 1 to 30."
            : "你现在是一个亚马逊流行词助手，必须围绕我给的所有产品信息生成30个亚马逊流行词(注意是修饰后的名词)。以下是例子（只需要参考结构，不需要参考词组）：假设产品信息是极轻便的电动自行车，你的输出类似：1.便携电动自行车；2.轻巧电动自行车；3.时尚电动自行车。你只需要输出关键词，每行一个，从1到30编号。";
        
        // 构建用户提示词
        const prompt = language === 'en'
            ? `Please generate 30 popular Amazon keywords (modified nouns) based on the following product description. Each keyword should be a modification or variation of the product name that customers might search for.

Product Description: ${productDescription}

Requirements:
1. Generate EXACTLY 30 keywords
2. Each keyword should be a modified noun (adjective + noun)
3. Keywords should be relevant to the product description
4. Keywords should be popular search terms on Amazon
5. Format each keyword with a number (1-30)
6. Do not include any explanations, just the numbered list of keywords
7. Output in English only`
            : `请根据以下产品描述生成30个亚马逊流行关键词（修饰后的名词）。每个关键词应该是产品名称的修饰或变体，是顾客可能会搜索的词。

产品描述: ${productDescription}

要求：
1. 必须生成恰好30个关键词
2. 每个关键词应该是修饰后的名词（形容词+名词）
3. 关键词应与产品描述相关
4. 关键词应该是亚马逊上的热门搜索词
5. 每个关键词前添加编号（1-30）
6. 不要包含任何解释，只需提供编号的关键词列表
7. 只使用中文输出`;

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 2000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        const content = response.data.choices[0].message.content;
        logger.info(`关键词推荐原始响应: ${content}`);
        
        // 处理响应内容
        // 提取关键词列表
        let keywords = content.trim();
        
        // 清理并格式化结果
        // 如果AI返回了额外的说明，尝试只提取编号列表部分
        const keywordsMatch = content.match(/(?:^|\n)(?:\d+[\.\s、]+.+(?:\n|$))+/g);
        if (keywordsMatch && keywordsMatch.length > 0) {
            keywords = keywordsMatch.join('\n');
        }
        
        // 进一步处理关键词
        let keywordArray = keywords.split(/\n/).map(line => line.trim()).filter(line => line);
        
        // 如果结果不足30个，可能需要进行二次调用补充
        if (keywordArray.length < 25) {
            logger.warn(`关键词数量不足，尝试二次调用补充`);
            
            // 二次调用，明确要求补充到30个
            const retryPrompt = language === 'en'
                ? `The previous response didn't generate enough keywords. Please generate EXACTLY 30 different popular Amazon keywords (modified nouns) for this product. Each keyword should be on a new line and numbered from 1 to 30.

Product Description: ${productDescription}`
                : `之前的响应没有生成足够的关键词。请为这个产品生成恰好30个不同的亚马逊流行关键词（修饰后的名词）。每个关键词应该另起一行，并从1到30编号。

产品描述: ${productDescription}`;
            
            try {
                const retryResponse = await axios.post(GLM4_API_URL, {
                    model: "GLM-4-Plus",
                    messages: [
                        {
                            role: "system",
                            content: systemMessage
                        },
                        {
                            role: "user",
                            content: retryPrompt
                        }
                    ],
                    temperature: 0.8, // 略微提高随机性以获得更多变化
                    top_p: 0.9,
                    max_tokens: 2000
                }, {
                    headers: getAuthHeaders()
                });
                
                const retryContent = retryResponse.data.choices[0].message.content;
                logger.info(`关键词补充响应: ${retryContent}`);
                
                // 替换原始关键词列表
                keywords = retryContent.trim();
                keywordArray = keywords.split(/\n/).map(line => line.trim()).filter(line => line);
            } catch (retryError) {
                logger.error(`关键词补充请求失败: ${retryError.message}`);
                // 保留原始结果，不替换
            }
        }
        
        // 确保返回的是格式化的关键词列表
        // 处理可能的编号格式，确保一致性
        keywordArray = keywordArray.map(kw => {
            // 移除开头的序号并整理格式
            return kw.replace(/^\d+[\.\s、]+/, '').trim();
        });
        
        // 确保返回30个关键词(或者尽可能多)
        if (keywordArray.length > 30) {
            keywordArray = keywordArray.slice(0, 30);
        }
        
        // 构建结果
        // 对于前端显示，我们返回处理过的关键词数组
        const result = {
            keywords: keywordArray
        };

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成亚马逊关键词推荐失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "生成亚马逊关键词推荐失败",
            details: error.message
        });
    }
});

// 亚马逊品牌起名
router.post('/brand-naming', protect, checkFeatureAccess('amazon_brand_naming'), async (req, res) => {
    try {
        const {
            productDescription,
            outputLanguage
        } = req.body;

        logger.info(`亚马逊品牌起名请求，输出语言: ${outputLanguage || 'zh'}`);

        if (!productDescription) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：产品描述"
            });
        }
        
        // 根据选择的语言设置system消息
        const systemMessage = outputLanguage === 'en' 
            ? "You are a creative brand naming expert. Based on the product information provided, please generate a brand name with the following considerations: Imagine what the brand for this product would look like. What is unique about this product and how will that influence your brand naming? Describe a perfect day that includes this product. How does your brand fit into this scenario? Who is the target audience for this product? What values would they want the brand to represent? Please respond in English only."
            : "你是一个创意品牌命名专家，请根据我提供的产品信息，生成一个品牌名。要求如下：想象一下，如果你的商品有自己的品牌，它会是什么样子的？你的商品的独特之处是什么？这将如何影响你的品牌命名？描述一个完美的日子，其中包括你的商品。你的品牌如何与这个场景相符？你的商品的目标客户群是什么样的人？他们希望你的品牌会代表什么价值观？请只用中文回复。";
        
        // 构建用户提示词
        let prompt;
        if (outputLanguage === 'en') {
            prompt = `Please generate a creative and product-specific brand name based on the following product information:

Product Description:
${productDescription}

When considering the brand name, please think about:
1. What is unique about this product? How will this influence the brand name?
2. Imagine a perfect day that includes this product. How would your brand name fit into this scenario?
3. Who is the target audience for this product? What values would they want the brand to represent?

Please return the brand name in the following JSON format:

{
  "brandNames": [
    {
      "name": "The Brand Name",
      "explanation": "Detailed explanation of the brand name, including the reasoning behind it and how it relates to the product's unique features, target audience, and usage scenarios.",
      "perfectDay": "A description of a perfect day that includes this product and how the brand name fits into this scenario.",
      "values": "The values that the brand name represents for the target audience."
    }
  ]
}`;
        } else {
            prompt = `请根据以下产品信息，生成一个有创意且符合产品特性的品牌名称：

产品描述：
${productDescription}

在考虑品牌名称时，请思考以下问题：
1. 这个产品的独特之处是什么？这将如何影响品牌命名？
2. 想象一个包含这个产品的完美日子。你的品牌名称如何与这个场景相符？
3. 产品的目标客户群是什么样的人？他们希望品牌代表什么价值观？

请按以下JSON格式返回品牌名称：

{
  "brandNames": [
    {
      "name": "品牌名称",
      "explanation": "品牌名称的详细解释，包括命名背后的理由以及它如何与产品的独特特性、目标受众和使用场景相关联。",
      "perfectDay": "描述一个包含这个产品的完美日子，以及品牌名称如何与这个场景相符。",
      "values": "这个品牌名称对目标受众代表的价值观。"
    }
  ]
}`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.8,
            top_p: 0.9,
            max_tokens: 2000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`品牌起名原始响应: ${content}`);
            
            // 提取JSON部分 - 改进正则表达式，处理```json标记
            let jsonContent = content;
            
            // 如果内容被```json包裹，提取内部内容
            const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonBlockMatch && jsonBlockMatch[1]) {
                jsonContent = jsonBlockMatch[1].trim();
            }
            
            try {
                // 直接尝试解析整个内容
                result = JSON.parse(jsonContent);
        } catch (parseError) {
                // 如果直接解析失败，尝试使用正则表达式提取JSON对象
                const jsonMatch = jsonContent.match(/(\{[\s\S]*\})/);
                
                if (jsonMatch && jsonMatch[1]) {
                    // 清理JSON字符串
                    let cleanedJson = jsonMatch[1]
                        .replace(/[\u0000-\u001F]+/g, ' ')  // 移除控制字符
                        .replace(/,\s*}/g, '}')             // 修复尾部逗号
                        .replace(/,\s*]/g, ']')             // 修复数组尾部逗号
                        .replace(/([^\\])\\n/g, '$1\\\\n')  // 修复换行符
                        .replace(/([^\\])\\r/g, '$1\\\\r')  // 修复回车符
                        .replace(/([^\\])\\t/g, '$1\\\\t'); // 修复制表符
                    
                    logger.info(`尝试清理后的JSON: ${cleanedJson}`);
                    
                    try {
                        result = JSON.parse(cleanedJson);
                    } catch (innerError) {
                        // 如果仍然解析失败，手动构建结果
                        throw new Error(`JSON解析失败: ${innerError.message}`);
                    }
                } else {
                    throw new Error('未找到有效的JSON格式');
                }
            }
            
            // 如果没有找到JSON格式或解析失败，尝试手动构建品牌名称
            if (!result || !result.brandNames || !result.brandNames.length) {
                logger.warn(`未找到有效的brandNames数组，尝试手动构建品牌名称`);
                
                // 尝试从内容中提取品牌名
                const brandNameMatch = content.match(/[""]([^""]+)[""]/);
                const brandName = brandNameMatch ? brandNameMatch[1] : (outputLanguage === 'en' ? "BrandName" : "品牌名称");
                
                // 构建默认品牌信息
                result = { 
                    brandNames: [{
                        name: brandName,
                        explanation: outputLanguage === 'en'
                            ? "This brand name aligns with the product characteristics and has appeal and memorability."
                            : "这个品牌名称与产品特性相符，具有吸引力和记忆点。",
                        perfectDay: outputLanguage === 'en'
                            ? "A perfect day with this product would be enjoyable and seamless, with the brand name reflecting the positive experience."
                            : "一个使用此产品的完美日子会非常愉快和顺畅，品牌名称反映了这种积极体验。",
                        values: outputLanguage === 'en'
                            ? "This brand name represents quality, reliability, and customer satisfaction."
                            : "这个品牌名称代表质量、可靠性和客户满意度。"
                    }]
                };
            }
            
            // 确保品牌名数组存在
            if (!Array.isArray(result.brandNames)) {
                result.brandNames = [];
            }
            
            // 确保至少有一个品牌名
            if (result.brandNames.length === 0) {
                result.brandNames.push({
                    name: outputLanguage === 'en' ? "BrandName" : "品牌名称",
                    explanation: outputLanguage === 'en'
                        ? "This is a brand name suggestion based on the product characteristics."
                        : "这是一个基于产品特性生成的品牌名称建议。",
                    perfectDay: outputLanguage === 'en'
                        ? "A perfect day with this product would enhance the user's experience and bring joy to their routine."
                        : "一个使用此产品的完美日子会提升用户体验，为日常生活带来愉悦。",
                    values: outputLanguage === 'en'
                        ? "This brand represents innovation, quality, and customer satisfaction."
                        : "这个品牌代表创新、品质和客户满意。"
                });
            }
            
            // 保留第一个品牌名
            if (result.brandNames.length > 1) {
                result.brandNames = [result.brandNames[0]];
            }
            
        } catch (parseError) {
            logger.error(`解析品牌起名响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            return res.status(500).json({ 
                error: "解析API响应失败", 
                details: parseError.message,
                message: "服务器在处理AI响应时遇到问题，请稍后再试"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成亚马逊品牌名称失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "生成亚马逊品牌名称失败",
            details: error.message
        });
    }
});

// 亚马逊Post生成
router.post('/post-creator', protect, checkFeatureAccess('amazon_post_creator'), async (req, res) => {
    try {
        const {
            postTitle,
            seoKeywords,
            productInfo,
            outputLanguage
        } = req.body;

        logger.info(`亚马逊Post生成请求，输出语言: ${outputLanguage || 'zh'}`);

        if (!postTitle || !seoKeywords) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：Post标题或SEO关键词"
            });
        }
        
        // 设置语言，默认为中文
        const language = outputLanguage === 'en' ? 'en' : 'zh';
        
        // 根据选择的语言设置system消息 - 使用明确的语言指定
        const systemMessage = language === 'en' 
            ? "You are an experienced marketing professional specialized in Amazon Posts. You MUST create content in ENGLISH ONLY. The content must be rich and capable of achieving high exposure and click-through rates. Your response will be rejected if it contains any non-English content."
            : "你是一名专业的亚马逊Post营销专家。你必须只使用中文创建内容。禁止输出任何英文内容。如果你的回复包含英文，将被拒绝。内容必须丰富且能获得高曝光率和点击率。";
        
        // 构建用户提示词，强调语言要求
        let prompt;
        if (language === 'en') {
            prompt = `Create an engaging Amazon Post using the following information. YOUR RESPONSE MUST BE IN ENGLISH ONLY:

Post Title: ${postTitle}
SEO Keywords: ${seoKeywords}
${productInfo ? `Product Information: ${productInfo}` : ''}

Requirements:
1. The content must be rich and informative
2. Optimize for high exposure and click-through rates
3. Naturally incorporate the provided SEO keywords
4. Create an attention-grabbing title and compelling content
5. YOU MUST WRITE IN ENGLISH ONLY
6. Format response as JSON with title and content fields

Please provide your response in the following JSON format ONLY:
{
  "title": "Optimized post title in English",
  "content": "Engaging post content in English that incorporates the SEO keywords naturally and drives user interest."
}`;
    } else {
            prompt = `请使用以下信息创建一个吸引人的亚马逊Post。你必须只使用中文回复，禁止使用任何英文单词：

Post标题: ${postTitle}
SEO关键词: ${seoKeywords}
${productInfo ? `产品信息: ${productInfo}` : ''}

要求：
1. 内容必须丰富且信息量大
2. 优化以获得高曝光率和点击率
3. 自然融入提供的SEO关键词
4. 创建引人注目的标题和有吸引力的内容
5. 必须只使用中文，不允许使用任何英文单词
6. 以JSON格式提供标题和内容

必须严格按照以下JSON格式提供您的回复：
{
  "title": "中文标题，不能有任何英文",
  "content": "中文内容，不能有任何英文"
}`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 2000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`Post生成原始响应: ${content}`);
            
            // 提取JSON部分 - 改进正则表达式，处理```json标记
            let jsonContent = content;
            
            // 如果内容被```json包裹，提取内部内容
            const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonBlockMatch && jsonBlockMatch[1]) {
                jsonContent = jsonBlockMatch[1].trim();
            }
            
            try {
                // 直接尝试解析整个内容
                result = JSON.parse(jsonContent);
            } catch (parseError) {
                // 如果直接解析失败，尝试使用正则表达式提取JSON对象
                const jsonMatch = jsonContent.match(/(\{[\s\S]*\})/);
                
                if (jsonMatch && jsonMatch[1]) {
                    // 清理JSON字符串
                    let cleanedJson = jsonMatch[1]
                        .replace(/[\u0000-\u001F]+/g, ' ')  // 移除控制字符
                        .replace(/,\s*}/g, '}')             // 修复尾部逗号
                        .replace(/,\s*]/g, ']')             // 修复数组尾部逗号
                        .replace(/([^\\])\\n/g, '$1\\\\n')  // 修复换行符
                        .replace(/([^\\])\\r/g, '$1\\\\r')  // 修复回车符
                        .replace(/([^\\])\\t/g, '$1\\\\t'); // 修复制表符
                    
                    logger.info(`尝试清理后的JSON: ${cleanedJson}`);
                    
                    try {
                        result = JSON.parse(cleanedJson);
                    } catch (innerError) {
                        // 如果仍然解析失败，尝试从内容中提取标题和正文
                        logger.warn(`JSON解析失败，尝试从内容中提取标题和正文`);
                        
                        // 尝试提取标题和内容
                        const titleMatch = content.match(/[""]title[""]:\s*[""]([^""]+)[""]/);
                        const contentMatch = content.match(/[""]content[""]:\s*[""]([^""]+)[""]/);
                        
                        result = {
                            title: titleMatch ? titleMatch[1] : postTitle,
                            content: contentMatch ? contentMatch[1] : content
                        };
                    }
                } else {
                    // 如果没有找到JSON格式，尝试分析内容提取标题和正文
                    logger.warn(`未找到JSON格式，尝试分析内容提取标题和正文`);
                    
                    // 尝试通过段落分割提取标题和内容
                    const paragraphs = content.split(/\n\n+/);
                    if (paragraphs.length >= 2) {
                        result = {
                            title: paragraphs[0].replace(/^[#\s]*/, '').trim(),
                            content: paragraphs.slice(1).join('\n\n').trim()
                        };
                    } else {
                        result = {
                            title: postTitle,
                            content: content.trim()
                        };
                    }
                }
            }
            
            // 确保结果包含标题和内容
            if (!result.title) {
                result.title = postTitle;
            }
            
            if (!result.content) {
                result.content = language === 'en'
                    ? "Content generation failed. Please try again with more specific keywords."
                    : "内容生成失败。请尝试使用更具体的关键词再次尝试。";
            }
            
            // 验证语言匹配 - 检查是否符合所选语言
            const isChinese = /[\u4e00-\u9fa5]/.test(result.title + result.content);
            const contentLanguageMatches = (language === 'zh' && isChinese) || (language === 'en' && !isChinese);
            
            // 如果语言不匹配，尝试进行翻译
            if (!contentLanguageMatches) {
                logger.warn(`检测到内容语言(${isChinese ? '中文' : '英文'})与选择的语言(${language})不匹配，尝试转换`);
                
                // 构建转换提示
                const translateSystemPrompt = language === 'en' 
                    ? "You are a translator. Your task is to translate the provided Chinese content into English. Keep the style and formatting consistent, but ensure the output is natural English."
                    : "你是一名翻译。你的任务是将提供的英文内容翻译成中文。保持风格和格式一致，但确保输出是自然流畅的中文。";
                
                const translatePrompt = language === 'en'
                    ? `Translate the following Amazon Post from Chinese to English. Maintain the same marketing style and format, but ensure it's in natural English:

Title: ${result.title}
Content: ${result.content}

Return the translation in JSON format:
{
  "title": "Translated title in English",
  "content": "Translated content in English"
}`
                    : `将以下亚马逊Post从英文翻译成中文。保持相同的营销风格和格式，但确保是自然流畅的中文：

标题: ${result.title}
内容: ${result.content}

以JSON格式返回翻译：
{
  "title": "中文翻译的标题",
  "content": "中文翻译的内容"
}`;
                
                try {
                    // 调用翻译API
                    const translateResponse = await axios.post(GLM4_API_URL, {
                        model: "GLM-4-Plus",
                        messages: [
                            {
                                role: "system",
                                content: translateSystemPrompt
                            },
                            {
                                role: "user",
                                content: translatePrompt
                            }
                        ],
                        temperature: 0.3, // 翻译使用较低的temperature确保准确性
                        top_p: 0.9,
                        max_tokens: 2000
                    }, {
                        headers: getAuthHeaders()
                    });
                    
                    const translateContent = translateResponse.data.choices[0].message.content;
                    logger.info(`翻译响应: ${translateContent}`);
                    
                    // 提取JSON
                    const translateJsonMatch = translateContent.match(/```(?:json)?\s*([\s\S]*?)```/) || translateContent.match(/(\{[\s\S]*\})/);
                    if (translateJsonMatch && translateJsonMatch[1]) {
                        try {
                            const translatedResult = JSON.parse(translateJsonMatch[1].trim());
                            
                            // 检查翻译结果是否符合目标语言
                            const translatedIsChinese = /[\u4e00-\u9fa5]/.test(translatedResult.title + translatedResult.content);
                            const translationMatches = (language === 'zh' && translatedIsChinese) || (language === 'en' && !translatedIsChinese);
                            
                            if (translationMatches) {
                                // 翻译成功，更新结果
                                result = translatedResult;
                                logger.info(`成功转换为${language === 'zh' ? '中文' : '英文'}内容`);
                            }
                        } catch (parseError) {
                            logger.error(`解析翻译JSON失败: ${parseError.message}`);
                        }
                    }
                } catch (translateError) {
                    logger.error(`翻译内容失败: ${translateError.message}`);
                }
                
                // 如果翻译失败但是用户要求中文，强制使用中文模板
                if (language === 'zh' && !/[\u4e00-\u9fa5]/.test(result.title + result.content)) {
                    logger.warn(`翻译失败，使用备用中文模板`);
                    result = {
                        title: `【${postTitle}】优质产品推荐`,
                        content: `为您推荐这款优质产品，结合了${seoKeywords}的所有优点。这款产品设计精良，功能强大，将为您带来出色的使用体验。它不仅美观大方，而且实用耐用，是您的理想之选。欢迎选购！`
                    };
                }
                
                // 如果翻译失败但是用户要求英文，强制使用英文模板
                if (language === 'en' && /[\u4e00-\u9fa5]/.test(result.title + result.content)) {
                    logger.warn(`翻译失败，使用备用英文模板`);
                    result = {
                        title: `[${postTitle}] Premium Product Recommendation`,
                        content: `We recommend this premium product that combines all the advantages of ${seoKeywords}. This product is well-designed, powerful, and will bring you an excellent user experience. It's not only beautiful but also practical and durable, making it your ideal choice. Welcome to purchase!`
                    };
                }
            }
            
        } catch (parseError) {
            logger.error(`解析Post生成响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            // 提供默认响应，确保语言正确
            result = {
                title: language === 'en' 
                    ? `[${postTitle}] Product Post` 
                    : `【${postTitle}】产品推荐`,
                content: language === 'en'
                    ? `Check out this amazing product featuring ${seoKeywords}. It offers great value and excellent performance.`
                    : `推荐这款出色的产品，包含${seoKeywords}特性。它提供了很高的性价比和出色的性能表现。`
            };
            
            return res.status(200).json({ 
                success: true,
                data: result,
                message: "生成过程中遇到问题，返回默认内容"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成亚马逊Post内容失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        
        // 提供默认响应，确保语言正确
        const language = req.body.outputLanguage === 'en' ? 'en' : 'zh';
        const defaultResult = {
            title: language === 'en' 
                ? `[${productName || 'Product'}] Amazon Post` 
                : `【${productName || '产品'}】亚马逊推荐`,
            content: language === 'en'
                ? `This is a default post content due to generation error. Please try again later.`
                : `由于生成错误，这是默认的帖子内容。请稍后再试。`
        };
        
        res.status(200).json({
            success: true,
            data: defaultResult,
            error: "生成过程中出现错误，返回默认内容"
        });
    }
});

// 亚马逊客服case内容生成
router.post('/case-creator', protect, checkFeatureAccess('amazon_case_creator'), async (req, res) => {
    try {
        const {
            issueDescription,
            orderNumber,
            accountInfo,
            outputLanguage
        } = req.body;

        logger.info(`亚马逊客服case内容生成请求，输出语言: ${outputLanguage || 'zh'}`);

        if (!issueDescription) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：问题描述"
            });
        }
        
        // 设置语言，默认为中文
        const language = outputLanguage === 'en' ? 'en' : 'zh';
        
        // 根据选择的语言设置system消息
        const systemMessage = language === 'en' 
            ? "As an Amazon top operations expert, you are proficient in Amazon's policies and rules, and familiar with techniques for communicating with Amazon customer service. Now I need you to write the most effective customer service case content from a seller's perspective. Please respond in English only."
            : "作为一个亚马逊顶级运营专家，你精通亚马逊的各项政策和规则要求，并熟悉与亚马逊客服沟通的技巧。现在我需要你以卖家身份找亚马逊客服开case的最有效的语气写一份case。";
        
        // 构建用户提示词
        let prompt;
        if (language === 'en') {
            prompt = `Please generate the most effective Amazon customer service case content based on the following information:

Issue Description: ${issueDescription}
${orderNumber ? `Order Number: ${orderNumber}` : ''}
${accountInfo ? `Account Information: ${accountInfo}` : ''}

Requirements:
1. The tone should be professional, clear, and respectful
2. The content should be structured for maximum effectiveness
3. Include all necessary information for Amazon to understand and resolve the issue
4. Use specific Amazon policies or rules where applicable
5. Format the response as a ready-to-submit customer service case
6. Write in a way that maximizes the chance of a favorable resolution

Please provide your response in the following JSON format:
{
  "caseTitle": "A concise title for the case",
  "caseContent": "The detailed case content formatted for maximum effectiveness",
  "tips": "Tips on follow-up actions or additional information that might help resolve the case"
}`;
        } else {
            prompt = `请根据以下信息生成最有效的亚马逊客服case内容：

问题描述: ${issueDescription}
${orderNumber ? `订单号: ${orderNumber}` : ''}
${accountInfo ? `账户信息: ${accountInfo}` : ''}

要求：
1. 语气应专业、清晰和尊重
2. 内容结构应该最大化效果
3. 包含所有必要信息，使亚马逊能够理解和解决问题
4. 适当引用亚马逊政策或规则
5. 格式化为可直接提交的客服case内容
6. 以最大化获得有利解决方案的机会的方式撰写

请按以下JSON格式提供您的回复：
{
  "caseTitle": "简洁的case标题",
  "caseContent": "格式化以最大化效果的详细case内容",
  "tips": "关于后续行动或可能有助于解决case的其他信息的提示"
}`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 3000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`客服case内容原始响应: ${content}`);
            
            // 提取JSON部分 - 改进正则表达式，处理```json标记
            let jsonContent = content;
            
            // 如果内容被```json包裹，提取内部内容
            const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonBlockMatch && jsonBlockMatch[1]) {
                jsonContent = jsonBlockMatch[1].trim();
            }
            
            try {
                // 直接尝试解析整个内容
                result = JSON.parse(jsonContent);
            } catch (parseError) {
                // 如果直接解析失败，尝试使用正则表达式提取JSON对象
                const jsonMatch = jsonContent.match(/(\{[\s\S]*\})/);
                
                if (jsonMatch && jsonMatch[1]) {
                    // 清理JSON字符串
                    let cleanedJson = jsonMatch[1]
                        .replace(/[\u0000-\u001F]+/g, ' ')  // 移除控制字符
                        .replace(/,\s*}/g, '}')             // 修复尾部逗号
                        .replace(/,\s*]/g, ']')             // 修复数组尾部逗号
                        .replace(/([^\\])\\n/g, '$1\\\\n')  // 修复换行符
                        .replace(/([^\\])\\r/g, '$1\\\\r')  // 修复回车符
                        .replace(/([^\\])\\t/g, '$1\\\\t'); // 修复制表符
                    
                    logger.info(`尝试清理后的JSON: ${cleanedJson}`);
                    
                    try {
                        result = JSON.parse(cleanedJson);
                    } catch (innerError) {
                        // 如果仍然解析失败，尝试从内容中提取各部分
                        throw new Error(`JSON解析失败: ${innerError.message}`);
                    }
                } else {
                    throw new Error('未找到有效的JSON格式');
                }
            }
            
            // 如果没有找到JSON格式或解析失败，尝试手动构建内容
            if (!result || (!result.caseTitle && !result.caseContent)) {
                logger.warn(`未找到有效的内容结构，尝试手动提取内容`);
                
                // 尝试从内容中提取标题和内容
                const titleMatch = content.match(/(?:标题|Title|Subject)[:：]\s*(.+?)(?:\n|$)/i);
                
                // 分割内容以尝试找到正文部分
                const paragraphs = content.split(/\n\n+/);
                let caseContent = '';
                
                if (paragraphs.length > 1) {
                    // 跳过可能的标题段落
                    caseContent = paragraphs.slice(1).join('\n\n');
                } else {
                    caseContent = content;
                }
                
                // 提取建议部分
                const tipsMatch = content.match(/(?:建议|Tips|Suggestions)[:：][\s\n]*([\s\S]+?)(?:\n\n|$)/i);
                
                result = {
                    caseTitle: titleMatch ? titleMatch[1].trim() : (language === 'en' ? "Request for Assistance" : "请求亚马逊协助"),
                    caseContent: caseContent.trim(),
                    tips: tipsMatch ? tipsMatch[1].trim() : (language === 'en' ? "Follow up within 24 hours if no response." : "如无回应，请在24小时内跟进。")
                };
            }
            
            // 确保结果包含必要字段
            if (!result.caseTitle) {
                result.caseTitle = language === 'en' ? "Request for Assistance" : "请求亚马逊协助";
            }
            
            if (!result.caseContent) {
                result.caseContent = language === 'en'
                    ? `I'm writing regarding the following issue: ${issueDescription}. Please assist with this matter as soon as possible.`
                    : `我写信是关于以下问题：${issueDescription}。请尽快协助解决此事。`;
            }
            
            if (!result.tips) {
                result.tips = language === 'en'
                    ? "Follow up within 24 hours if no response. Maintain a polite and professional tone in all communications."
                    : "如无回应，请在24小时内跟进。在所有沟通中保持礼貌和专业的语气。";
            }
            
            // 验证语言匹配
            const isChinese = /[\u4e00-\u9fa5]/.test(result.caseTitle + result.caseContent);
            const contentLanguageMatches = (language === 'zh' && isChinese) || (language === 'en' && !isChinese);
            
            // 如果语言不匹配，使用默认模板
            if (!contentLanguageMatches) {
                logger.warn(`语言不匹配，使用默认模板`);
                if (language === 'zh' && !isChinese) {
                    result = {
                        caseTitle: "请求亚马逊协助",
                        caseContent: `尊敬的亚马逊客服团队：\n\n我是一名亚马逊卖家，需要您的帮助解决以下问题：${issueDescription}。\n\n${orderNumber ? `相关订单号：${orderNumber}\n` : ''}${accountInfo ? `账户信息：${accountInfo}\n` : ''}\n感谢您的及时关注和解决。\n\n此致\n亚马逊卖家`,
                        tips: "如无回应，请在24小时内跟进。在所有沟通中保持礼貌和专业的语气。"
                    };
                } else if (language === 'en' && isChinese) {
                    result = {
                        caseTitle: "Request for Amazon Assistance",
                        caseContent: `Dear Amazon Customer Service Team,\n\nI am an Amazon seller and need your help with the following issue: ${issueDescription}.\n\n${orderNumber ? `Related Order Number: ${orderNumber}\n` : ''}${accountInfo ? `Account Information: ${accountInfo}\n` : ''}\nThank you for your prompt attention and resolution to this matter.\n\nBest regards,\nAmazon Seller`,
                        tips: "Follow up within 24 hours if no response. Maintain a polite and professional tone in all communications."
                    };
                }
            }
            
        } catch (parseError) {
            logger.error(`解析客服case内容响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            // 提供默认响应
            result = {
                caseTitle: language === 'en' ? "Request for Assistance" : "请求亚马逊协助",
                caseContent: language === 'en'
                    ? `Dear Amazon Customer Service Team,\n\nI am an Amazon seller and need your help with the following issue: ${issueDescription}.\n\n${orderNumber ? `Related Order Number: ${orderNumber}\n` : ''}${accountInfo ? `Account Information: ${accountInfo}\n` : ''}\nThank you for your prompt attention and resolution to this matter.\n\nBest regards,\nAmazon Seller`
                    : `尊敬的亚马逊客服团队：\n\n我是一名亚马逊卖家，需要您的帮助解决以下问题：${issueDescription}。\n\n${orderNumber ? `相关订单号：${orderNumber}\n` : ''}${accountInfo ? `账户信息：${accountInfo}\n` : ''}\n感谢您的及时关注和解决。\n\n此致\n亚马逊卖家`,
                tips: language === 'en'
                    ? "Follow up within 24 hours if no response. Maintain a polite and professional tone in all communications."
                    : "如无回应，请在24小时内跟进。在所有沟通中保持礼貌和专业的语气。"
            };
            
            return res.status(200).json({
                success: true,
                data: result,
                message: "解析AI响应失败，提供默认内容"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成亚马逊客服case内容失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        
        // 提供默认响应
        const language = outputLanguage === 'en' ? 'en' : 'zh';
        const defaultResult = {
            caseTitle: language === 'en' ? "Request for Assistance" : "请求亚马逊协助",
            caseContent: language === 'en'
                ? `Dear Amazon Customer Service Team,\n\nI am an Amazon seller and need your help with the following issue: ${issueDescription || 'my urgent issue'}.\n\nThank you for your prompt attention and resolution to this matter.\n\nBest regards,\nAmazon Seller`
                : `尊敬的亚马逊客服团队：\n\n我是一名亚马逊卖家，需要您的帮助解决以下问题：${issueDescription || '我的紧急问题'}。\n\n感谢您的及时关注和解决。\n\n此致\n亚马逊卖家`,
            tips: language === 'en'
                ? "Follow up within 24 hours if no response. Maintain a polite and professional tone in all communications."
                : "如无回应，请在24小时内跟进。在所有沟通中保持礼貱和专业的语气。"
        };
        
        res.status(200).json({
            success: true,
            data: defaultResult,
            error: "生成过程中出现错误，返回默认内容"
        });
    }
});

// 选品的改款分析和建议
router.post('/product-improvement', protect, checkFeatureAccess('product_improvement_analysis'), async (req, res) => {
    try {
        const {
            title,
            bulletPoints,
            description,
            outputLanguage
        } = req.body;

        logger.info(`选品的改款分析和建议请求，输出语言: ${outputLanguage || 'zh'}`);

        if (!title || !bulletPoints) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：标题或五点描述"
            });
        }
        
        // 如果没有提供description，设置为空字符串
        const descriptionText = description || "";
        
        // 设置语言，默认为中文
        const language = outputLanguage === 'en' ? 'en' : 'zh';
        
        // 设置系统提示词
        const systemMessage = language === 'en' 
            ? "You are an experienced Amazon product selection expert and product manager. Your task is to provide comprehensive improvement analysis and professional suggestions for the product. Please respond in English only."
            : "作为一名经验丰富的亚马逊选品和产品经理，你的任务是对产品进行全面的改款分析，并提出你的专业建议。请只用中文回复。";
        
        // 构建用户提示词
        let prompt;
        if (language === 'en') {
            prompt = `In the current market environment, your task is to conduct a comprehensive improvement analysis for [${title}] and provide your professional advice.

Product Details:
Bullet Points: ${bulletPoints}
Description: ${descriptionText}

Please consider the following questions for your analysis:

1. Product Status Analysis: Can you detail the main features of this product? Including its unique selling points, advantages, and possible shortcomings.

2. User Needs Identification: What product features are users most concerned about in the target market? Are these features fully reflected in our product?

3. Competitive Analysis: What similar products are there in the market? Compared to them, what are the advantages and disadvantages of our product? Please provide a detailed competitive analysis.

4. Potential Improvement Directions: Based on your understanding of the market and user needs, how do you think our product should be improved? Please provide your insights from the perspectives of product functionality, design, and user experience.

5. Specific Improvement Suggestions: Please give your specific suggestions for product improvement, including but not limited to product design, function improvement, user experience enhancement, etc. I hope you can break down each suggestion into executable steps and provide a rough timeline and expected outcomes.

Please provide your analysis and suggestions in the following JSON format:
{
  "productAnalysis": "Detailed analysis of the product's current status, including its main features, unique selling points, advantages, and shortcomings",
  "userNeeds": "Analysis of user needs in the target market and how well the product meets these needs",
  "competitiveAnalysis": "Detailed analysis of similar products in the market and how this product compares",
  "improvementDirections": "General directions for improvement based on market and user needs",
  "specificSuggestions": "Specific, actionable suggestions for product improvement with steps, timeline, and expected outcomes"
}`;
        } else {
            prompt = `在当前市场环境下，你的任务是对【${title}】进行全面的改款分析，并提出你的专业建议。

产品详细信息:
五点描述: ${bulletPoints}
Description: ${descriptionText}

请参考以下问题进行思考和分析：

1. 产品现状分析：您能详述这款产品的主要特性吗？包括其独特的卖点、优点和可能存在的不足。

2. 用户需求识别：在目标市场中，哪些产品特性是用户最关心的？这些特性在我们的产品中是否得到了充分的体现？

3. 竞品对比分析：在市场上有哪些类似产品？我们的产品与它们相比，有什么优势和劣势？请提供详细的竞品分析。

4. 潜在改进方向：根据你对市场和用户需求的理解，你认为应该如何改进我们的产品？请从产品功能、设计和用户体验等角度给出你的见解。

5. 具体改款建议：请给出你对产品改款的具体建议，包括但不限于产品设计、功能改进、用户体验提升等方面。希望你能将每个建议分解成可执行的步骤，并提供大概的时间线和预期成果。

请按以下JSON格式提供你的分析和建议：
{
  "productAnalysis": "对产品当前状况的详细分析，包括其主要特性、独特卖点、优点和不足",
  "userNeeds": "目标市场中用户需求的分析以及产品如何满足这些需求",
  "competitiveAnalysis": "市场上类似产品的详细分析以及本产品的比较情况",
  "improvementDirections": "基于市场和用户需求的总体改进方向",
  "specificSuggestions": "具体的产品改进建议，包含可执行步骤、时间线和预期成果"
}`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 4000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`选品改款分析原始响应: ${content}`);
            
            // 提取JSON部分 - 改进正则表达式，处理```json标记
            let jsonContent = content;
            
            // 如果内容被```json包裹，提取内部内容
            const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonBlockMatch && jsonBlockMatch[1]) {
                jsonContent = jsonBlockMatch[1].trim();
            }
            
            try {
                // 直接尝试解析整个内容
                result = JSON.parse(jsonContent);
            } catch (parseError) {
                // 如果直接解析失败，尝试使用正则表达式提取JSON对象
                const jsonMatch = jsonContent.match(/(\{[\s\S]*\})/);
                
                if (jsonMatch && jsonMatch[1]) {
                    // 清理JSON字符串
                    let cleanedJson = jsonMatch[1]
                        .replace(/[\u0000-\u001F]+/g, ' ')  // 移除控制字符
                        .replace(/,\s*}/g, '}')             // 修复尾部逗号
                        .replace(/,\s*]/g, ']')             // 修复数组尾部逗号
                        .replace(/([^\\])\\n/g, '$1\\\\n')  // 修复换行符
                        .replace(/([^\\])\\r/g, '$1\\\\r')  // 修复回车符
                        .replace(/([^\\])\\t/g, '$1\\\\t'); // 修复制表符
                    
                    logger.info(`尝试清理后的JSON: ${cleanedJson}`);
                    
                    try {
                        result = JSON.parse(cleanedJson);
                    } catch (innerError) {
                        // 如果仍然解析失败，尝试手动构建结果
                        throw new Error(`JSON解析失败: ${innerError.message}`);
                    }
                } else {
                    // 如果没有找到JSON格式，尝试手动提取内容
                    logger.warn(`未找到JSON格式，尝试手动提取内容`);
                    
                    // 尝试提取各部分内容
                    const productAnalysisMatch = content.match(/(?:产品现状分析|Product Status Analysis|productAnalysis)[:：][\s\n]*([\s\S]*?)(?=(?:用户需求识别|User Needs Identification|userNeeds)[:：]|$)/i);
                    const userNeedsMatch = content.match(/(?:用户需求识别|User Needs Identification|userNeeds)[:：][\s\n]*([\s\S]*?)(?=(?:竞品对比分析|Competitive Analysis|competitiveAnalysis)[:：]|$)/i);
                    const competitiveAnalysisMatch = content.match(/(?:竞品对比分析|Competitive Analysis|competitiveAnalysis)[:：][\s\n]*([\s\S]*?)(?=(?:潜在改进方向|Potential Improvement Directions|improvementDirections)[:：]|$)/i);
                    const improvementDirectionsMatch = content.match(/(?:潜在改进方向|Potential Improvement Directions|improvementDirections)[:：][\s\n]*([\s\S]*?)(?=(?:具体改款建议|Specific Improvement Suggestions|specificSuggestions)[:：]|$)/i);
                    const specificSuggestionsMatch = content.match(/(?:具体改款建议|Specific Improvement Suggestions|specificSuggestions)[:：][\s\n]*([\s\S]*?)$/i);
                    
                    result = {
                        productAnalysis: productAnalysisMatch ? productAnalysisMatch[1].trim() : "无法提取产品现状分析",
                        userNeeds: userNeedsMatch ? userNeedsMatch[1].trim() : "无法提取用户需求识别",
                        competitiveAnalysis: competitiveAnalysisMatch ? competitiveAnalysisMatch[1].trim() : "无法提取竞品对比分析",
                        improvementDirections: improvementDirectionsMatch ? improvementDirectionsMatch[1].trim() : "无法提取潜在改进方向",
                        specificSuggestions: specificSuggestionsMatch ? specificSuggestionsMatch[1].trim() : "无法提取具体改款建议"
                    };
                }
            }
            
            // 验证结果包含所有必要字段
            const requiredFields = ['productAnalysis', 'userNeeds', 'competitiveAnalysis', 'improvementDirections', 'specificSuggestions'];
            for (const field of requiredFields) {
                if (!result[field]) {
                    if (language === 'en') {
                        result[field] = `Unable to extract information for ${field}.`;
                    } else {
                        result[field] = `无法提取${field}的相关信息。`;
                    }
                }
            }
            
        } catch (parseError) {
            logger.error(`解析选品改款分析响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            // 提供默认响应
            result = {
                productAnalysis: language === 'en' 
                    ? `Analysis of the current status of [${title}]. Please try again with more detailed information.` 
                    : `[${title}]的当前状况分析。请提供更详细的信息再试。`,
                userNeeds: language === 'en'
                    ? "Identification of user needs in the target market. Please try again with more detailed information."
                    : "目标市场中用户需求的识别。请提供更详细的信息再试。",
                competitiveAnalysis: language === 'en'
                    ? "Comparative analysis of similar products in the market. Please try again with more detailed information."
                    : "市场上类似产品的对比分析。请提供更详细的信息再试。",
                improvementDirections: language === 'en'
                    ? "Potential directions for improvement. Please try again with more detailed information."
                    : "潜在的改进方向。请提供更详细的信息再试。",
                specificSuggestions: language === 'en'
                    ? "Specific suggestions for product improvement. Please try again with more detailed information."
                    : "对产品改进的具体建议。请提供更详细的信息再试。"
            };
            
            return res.status(200).json({
                success: true,
                data: result,
                message: "解析AI响应失败，提供默认内容"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`生成选品的改款分析和建议失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        
        // 提供默认响应
        const language = outputLanguage === 'en' ? 'en' : 'zh';
        const defaultResult = {
            productAnalysis: language === 'en' 
                ? "We couldn't generate a product analysis at this time. Please try again later." 
                : "我们暂时无法生成产品分析。请稍后再试。",
            userNeeds: language === 'en'
                ? "We couldn't identify user needs at this time. Please try again later."
                : "我们暂时无法识别用户需求。请稍后再试。",
            competitiveAnalysis: language === 'en'
                ? "We couldn't generate a competitive analysis at this time. Please try again later."
                : "我们暂时无法生成竞品分析。请稍后再试。",
            improvementDirections: language === 'en'
                ? "We couldn't suggest improvement directions at this time. Please try again later."
                : "我们暂时无法提供改进方向。请稍后再试。",
            specificSuggestions: language === 'en'
                ? "We couldn't provide specific suggestions at this time. Please try again later."
                : "我们暂时无法提供具体建议。请稍后再试。"
        };
        
        res.status(200).json({
            success: true,
            data: defaultResult,
            error: "生成过程中出现错误，返回默认内容"
        });
    }
});

// 品牌信息收集和总结
router.post('/brand-info', protect, checkFeatureAccess('amazon_brand_info'), async (req, res) => {
    try {
        const {
            brandName,
            industryCategory,
            outputLanguage
        } = req.body;

        logger.info(`品牌信息收集请求，品牌名称: ${brandName}`);

        if (!brandName) {
            return res.status(400).json({
                success: false,
                error: "缺少必要参数：品牌名称"
            });
        }
        
        // 设置系统提示词
        const systemMessage = "你是一名专业的品牌分析师和市场研究专家，擅长从多个渠道收集和分析品牌信息。";
        
        // 构建用户提示词 - 使用更新后的收集模板
        let prompt;
        if (outputLanguage === 'en') {
            prompt = `Please collect and analyze comprehensive information about the following brand:

Brand Name: ${brandName}
${industryCategory ? `Industry Category: ${industryCategory}` : ''}

DATA COLLECTION FRAMEWORK:
Conduct a thorough analysis by gathering information from Google, Amazon, YouTube, Facebook, TikTok, Walmart, other e-commerce platforms, social media, blogs, news sources, and all available channels. Please provide detailed information about this brand.

Required information includes:
1. Brand founding time, location, and countries of operation
2. Detailed description of the brand's background and characteristics
3. Detailed description of the brand's position within its industry
4. Which products from this brand sell best (with detailed list)
5. Online sales performance with specific data
6. Comprehensive brand evaluation from multiple perspectives

Please format your response as JSON with the following structure:
{
  "brandName": "${brandName}",
  "foundingInfo": "Founding time, location, and countries of operation",
  "background": "Detailed description of the brand's background and characteristics",
  "marketPosition": "Detailed description of the brand's position within its industry", 
  "topProducts": "List of the brand's best-selling products with details",
  "salesData": "Online sales performance with specific data",
  "brandEvaluation": "Comprehensive brand evaluation from multiple perspectives"
}`;
        } else {
            prompt = `请收集和分析以下品牌的全面信息：

品牌名称: ${brandName}
${industryCategory ? `行业类别: ${industryCategory}` : ''}

数据收集框架：
通过google、amazon、youtube、facebook、tiktok、walmart及其他电商平台、社交媒体、博客、新闻等进行全方位分析。请告诉我这个品牌的详细信息。

详细信息包括：
1. 品牌成立时间、地点、涉及到的国家
2. 详细描述品牌背景和特点
3. 详细描述品牌在它所处的行业内的地位
4. 品牌下的哪几款产品卖的最好，详细列举
5. 品牌在线销售情况并有详细的数据
6. 全方位地详细描述品牌评价

请按照以下JSON结构格式化您的回复：
{
  "brandName": "${brandName}",
  "foundingInfo": "品牌成立时间、地点、涉及到的国家",
  "background": "详细描述品牌背景和特点",
  "marketPosition": "详细描述品牌在它所处的行业内的地位", 
  "topProducts": "品牌下的哪几款产品卖的最好，详细列举",
  "salesData": "品牌在线销售情况并有详细的数据",
  "brandEvaluation": "全方位地详细描述品牌评价"
}`;
        }

        // 调用GLM-4 API
        const response = await axios.post(GLM4_API_URL, {
            model: "GLM-4-Plus",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 4000
        }, {
            headers: getAuthHeaders()
        });

        // 解析API响应
        let result;
        try {
            const content = response.data.choices[0].message.content;
            logger.info(`品牌信息收集原始响应: ${content}`);
            
            // 提取JSON部分
            const jsonMatch = content.match(/(\{[\s\S]*\})/);
            
            if (jsonMatch && jsonMatch[1]) {
                // 尝试解析找到的JSON对象
                try {
                    result = JSON.parse(jsonMatch[1]);
                } catch (innerError) {
                    // 如果解析失败，尝试清理JSON字符串后再解析
                    let cleanedJson = jsonMatch[1]
                        .replace(/[\u0000-\u001F]+/g, ' ')  // 移除控制字符
                        .replace(/,\s*}/g, '}')             // 修复尾部逗号
                        .replace(/,\s*]/g, ']');            // 修复数组尾部逗号
                    
                    logger.info(`尝试清理后的JSON: ${cleanedJson}`);
                    result = JSON.parse(cleanedJson);
                }
            } else {
                // 如果没有找到JSON格式，尝试构建结构
                logger.warn(`未找到JSON格式，尝试从内容中提取结构化信息`);
                
                // 提取各部分内容（使用基于标题的提取）
                const foundingInfoMatch = content.match(/(?:1\.|\(1\)|1\))\s*(品牌成立时间[\s\S]*?)(?=(?:2\.|\(2\)|2\)))/i) || 
                                         content.match(/(?:founding|established|品牌成立)[\s\S]*?([\s\S]*?)(?=(?:background|品牌背景|brand|背景特点))/i);
                
                const backgroundMatch = content.match(/(?:2\.|\(2\)|2\))\s*(详细描述品牌背景[\s\S]*?)(?=(?:3\.|\(3\)|3\)))/i) || 
                                      content.match(/(?:background|品牌背景)[\s\S]*?([\s\S]*?)(?=(?:market|position|行业|地位))/i);
                
                const marketPositionMatch = content.match(/(?:3\.|\(3\)|3\))\s*(详细描述品牌在[\s\S]*?)(?=(?:4\.|\(4\)|4\)))/i) || 
                                          content.match(/(?:market position|行业地位|position|市场地位)[\s\S]*?([\s\S]*?)(?=(?:products|产品|销量最好))/i);
                
                const topProductsMatch = content.match(/(?:4\.|\(4\)|4\))\s*(品牌下的哪几款产品[\s\S]*?)(?=(?:5\.|\(5\)|5\)))/i) || 
                                       content.match(/(?:top products|best-selling|畅销产品|产品卖的最好)[\s\S]*?([\s\S]*?)(?=(?:sales|销售|在线销售))/i);
                
                const salesDataMatch = content.match(/(?:5\.|\(5\)|5\))\s*(品牌在线销售情况[\s\S]*?)(?=(?:6\.|\(6\)|6\)))/i) || 
                                     content.match(/(?:sales data|销售数据|在线销售)[\s\S]*?([\s\S]*?)(?=(?:evaluation|评价|品牌评价))/i);
                
                const brandEvaluationMatch = content.match(/(?:6\.|\(6\)|6\))\s*(全方位地详细描述品牌评价[\s\S]*?)(?=$)/i) || 
                                           content.match(/(?:brand evaluation|品牌评价|综合评价)[\s\S]*?([\s\S]*?)(?=$)/i);
                
                // 构建结果对象
                result = {
                    brandName: brandName,
                    foundingInfo: foundingInfoMatch ? foundingInfoMatch[1].trim() : "未找到品牌成立信息",
                    background: backgroundMatch ? backgroundMatch[1].trim() : "未找到品牌背景信息",
                    marketPosition: marketPositionMatch ? marketPositionMatch[1].trim() : "未找到市场地位信息",
                    topProducts: topProductsMatch ? topProductsMatch[1].trim() : "未找到畅销产品信息",
                    salesData: salesDataMatch ? salesDataMatch[1].trim() : "未找到销售数据信息",
                    brandEvaluation: brandEvaluationMatch ? brandEvaluationMatch[1].trim() : "未找到品牌评价信息"
                };
            }
        } catch (parseError) {
            logger.error(`解析品牌信息收集响应失败: ${parseError.message}`, { error: parseError });
            
            // 记录更多调试信息
            if (response.data && response.data.choices && response.data.choices[0]) {
                logger.error(`API响应内容: ${JSON.stringify(response.data.choices[0].message)}`);
            }
            
            return res.status(500).json({ 
                error: "解析API响应失败", 
                details: parseError.message,
                message: "服务器在处理AI响应时遇到问题，请稍后再试"
            });
        }

        // 返回结果
        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error(`品牌信息收集失败: ${error.message}`);
        console.error("API错误详情:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: "品牌信息收集失败",
            details: error.message
        });
    }
});

module.exports = router; 
-- 萤火AI数据库导出 - 2025-06-03T06:44:26.178Z
-- 数据库: image_translator
-- ------------------------------------------------------

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;


--
-- 表结构 `feature_usages`
--

DROP TABLE IF EXISTS `feature_usages`;
CREATE TABLE `feature_usages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `userId` int(11) NOT NULL,
  `featureName` varchar(100) NOT NULL,
  `usageCount` int(11) NOT NULL DEFAULT 0,
  `lastUsedAt` datetime NOT NULL,
  `resetDate` date NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `feature_usages_user_id_feature_name` (`userId`,`featureName`),
  UNIQUE KEY `feature_usages_user_feature` (`userId`,`featureName`),
  CONSTRAINT `feature_usages_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=85 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- 转存表中的数据 `feature_usages`
--

INSERT INTO `feature_usages` VALUES
(3, 1, 'translate', 15, '2025-04-28 02:09:52', '2025-04-27', '2025-04-24 00:51:16', '2025-04-28 02:09:52'),
(4, 1, 'image-upscaler', 5, '2025-04-27 07:29:22', '2025-04-27', '2025-04-24 00:56:50', '2025-04-27 07:29:22'),
(5, 1, 'scene-generator', 4, '2025-04-27 06:16:54', '2025-04-27', '2025-04-24 00:57:48', '2025-04-27 06:16:54'),
(6, 1, 'marketing-images', 11, '2025-04-27 06:15:57', '2025-04-27', '2025-04-24 01:23:54', '2025-04-27 06:15:57'),
(7, 1, 'cutout', 6, '2025-04-27 06:16:52', '2025-04-27', '2025-04-24 01:24:40', '2025-04-27 06:16:52'),
(8, 1, 'image-removal', 3, '2025-04-27 06:23:32', '2025-04-27', '2025-04-24 01:25:09', '2025-04-27 06:23:32'),
(9, 1, 'clothing-simulation', 3, '2025-04-27 06:24:02', '2025-04-27', '2025-04-24 01:25:34', '2025-04-27 06:24:02'),
(10, 1, 'model-skin-changer', 7, '2025-04-27 06:40:32', '2025-04-27', '2025-04-24 01:25:36', '2025-04-27 06:40:32'),
(11, 4, 'translate', 2, '2025-04-26 01:53:27', '2025-04-26', '2025-04-25 02:09:24', '2025-04-26 01:53:27'),
(12, 4, 'marketing-images', 9, '2025-04-26 03:50:06', '2025-04-26', '2025-04-25 02:25:26', '2025-04-26 03:50:06'),
(13, 4, 'clothing-simulation', 1, '2025-04-26 03:39:18', '2025-04-26', '2025-04-25 02:38:34', '2025-04-26 03:39:18'),
(14, 4, 'cutout', 4, '2025-04-26 03:10:45', '2025-04-26', '2025-04-25 07:33:00', '2025-04-26 03:10:45'),
(15, 4, 'scene-generator', 4, '2025-04-26 03:25:21', '2025-04-26', '2025-04-25 08:29:37', '2025-04-26 03:25:21'),
(16, 4, 'image-removal', 2, '2025-04-26 03:35:22', '2025-04-26', '2025-04-25 08:59:29', '2025-04-26 03:35:22'),
(17, 4, 'model-skin-changer', 4, '2025-04-26 03:37:19', '2025-04-26', '2025-04-25 09:51:10', '2025-04-26 03:37:19'),
(18, 1, 'virtual-model', 71, '2025-04-29 00:56:25', '2025-04-27', '2025-04-27 08:22:04', '2025-04-29 00:56:25'),
(19, 1, 'text-to-video', 5, '2025-04-29 09:33:53', '2025-04-29', '2025-04-29 07:27:32', '2025-04-29 09:33:53'),
(20, 1, 'IMAGE_EDIT', 66, '2025-05-09 07:18:56', '2025-05-06', '2025-05-06 02:57:41', '2025-05-09 07:18:56'),
(23, 1, 'LOCAL_REDRAW', 18, '2025-05-09 01:20:12', '2025-05-06', '2025-05-06 06:54:58', '2025-05-09 01:20:12'),
(24, 1, 'IMAGE_COLORIZATION', 10, '2025-05-09 00:32:54', '2025-05-06', '2025-05-06 09:17:10', '2025-05-09 00:32:54'),
(25, 1, 'IMAGE_EXPANSION', 13, '2025-05-07 05:55:47', '2025-05-07', '2025-05-07 01:19:02', '2025-05-07 05:55:47'),
(26, 1, 'VIRTUAL_SHOE_MODEL', 9, '2025-05-08 00:46:13', '2025-05-07', '2025-05-07 06:44:40', '2025-05-08 00:46:13'),
(27, 1, 'TEXT_TO_IMAGE', 6, '2025-05-08 03:51:53', '2025-05-08', '2025-05-08 02:45:08', '2025-05-08 03:51:53'),
(28, 1, 'IMAGE_SHARPENING', 1, '2025-05-09 07:18:56', '2025-05-09', '2025-05-09 07:18:56', '2025-05-09 07:18:56'),
(32, 3, 'IMAGE_EXPANSION', 2, '2025-05-16 07:28:10', '2025-05-09', '2025-05-09 07:56:55', '2025-05-16 07:28:10'),
(33, 3, 'IMAGE_EDIT', 6, '2025-05-24 02:19:07', '2025-05-09', '2025-05-09 08:03:16', '2025-05-24 02:19:07'),
(34, 3, 'CLOTH_SEGMENTATION', 3, '2025-05-22 02:05:16', '2025-05-09', '2025-05-09 09:28:14', '2025-05-22 02:05:16'),
(35, 3, 'GLOBAL_STYLE', 3, '2025-05-22 08:20:26', '2025-05-10', '2025-05-10 00:32:52', '2025-05-22 08:20:26'),
(36, 3, 'IMAGE_COLORIZATION', 4, '2025-05-30 08:52:58', '2025-05-14', '2025-05-14 03:07:40', '2025-05-30 08:52:58'),
(37, 3, 'cutout', 1, '2025-05-15 03:27:21', '2025-05-15', '2025-05-15 03:27:21', '2025-05-15 03:27:21'),
(38, 3, 'translate', 4, '2025-05-30 03:36:42', '2025-05-16', '2025-05-16 07:18:09', '2025-05-30 03:36:42'),
(39, 3, 'image-upscaler', 1, '2025-05-17 02:25:43', '2025-05-17', '2025-05-17 02:25:43', '2025-05-17 02:25:43'),
(40, 3, '视频字幕擦除', 7, '2025-05-19 08:41:16', '2025-05-19', '2025-05-19 07:44:16', '2025-05-19 08:41:16'),
(44, 3, 'MULTI_IMAGE_TO_VIDEO', 3, '2025-05-22 06:55:08', '2025-05-21', '2025-05-21 08:18:08', '2025-05-22 06:55:08'),
(45, 3, 'VIDEO_SUBTITLE_REMOVER', 4, '2025-05-21 08:57:37', '2025-05-21', '2025-05-21 08:53:53', '2025-05-21 08:57:37'),
(46, 3, 'DIGITAL_HUMAN_VIDEO', 7, '2025-05-22 02:03:22', '2025-05-22', '2025-05-22 00:36:16', '2025-05-22 02:03:22'),
(54, 3, 'VIDEO_STYLE_REPAINT', 21, '2025-05-26 06:30:43', '2025-05-23', '2025-05-23 06:39:05', '2025-05-26 06:30:43'),
(67, 3, 'product_improvement_analysis', 4, '2025-05-29 09:57:22', '2025-05-29', '2025-05-29 05:43:22', '2025-05-29 09:57:22'),
(68, 3, 'amazon_video_script', 4, '2025-05-29 09:49:40', '2025-05-29', '2025-05-29 05:49:22', '2025-05-29 09:49:40'),
(69, 3, 'amazon_brand_info', 13, '2025-05-29 09:47:38', '2025-05-29', '2025-05-29 06:36:11', '2025-05-29 09:47:38'),
(70, 3, 'amazon_listing', 2, '2025-05-29 07:53:56', '2025-05-29', '2025-05-29 07:52:30', '2025-05-29 07:53:56'),
(71, 3, 'amazon_search_term', 2, '2025-05-29 08:02:06', '2025-05-29', '2025-05-29 08:01:47', '2025-05-29 08:02:06'),
(72, 3, 'amazon_review_analysis', 1, '2025-05-29 08:12:14', '2025-05-29', '2025-05-29 08:12:14', '2025-05-29 08:12:14'),
(73, 3, 'amazon_consumer_insights', 1, '2025-05-29 08:13:07', '2025-05-29', '2025-05-29 08:13:07', '2025-05-29 08:13:07'),
(74, 3, 'amazon_customer_email', 1, '2025-05-29 08:14:52', '2025-05-29', '2025-05-29 08:14:52', '2025-05-29 08:14:52'),
(75, 3, 'fba_claim_email', 2, '2025-05-29 08:23:39', '2025-05-29', '2025-05-29 08:22:52', '2025-05-29 08:23:39'),
(76, 3, 'amazon_review_generator', 3, '2025-05-29 08:36:02', '2025-05-29', '2025-05-29 08:25:44', '2025-05-29 08:36:02'),
(77, 3, 'amazon_review_response', 1, '2025-05-29 08:36:54', '2025-05-29', '2025-05-29 08:36:54', '2025-05-29 08:36:54'),
(78, 3, 'product_comparison', 5, '2025-05-29 09:12:03', '2025-05-29', '2025-05-29 08:38:26', '2025-05-29 09:12:03'),
(79, 3, 'amazon_brand_naming', 3, '2025-05-30 03:35:27', '2025-05-29', '2025-05-29 09:20:01', '2025-05-30 03:35:27'),
(80, 3, 'amazon_post_creator', 3, '2025-05-29 09:48:50', '2025-05-29', '2025-05-29 09:29:04', '2025-05-29 09:48:50'),
(81, 3, 'amazon_case_creator', 3, '2025-05-30 03:12:19', '2025-05-29', '2025-05-29 09:57:59', '2025-05-30 03:12:19'),
(82, 3, 'amazon_keyword_recommender', 5, '2025-05-30 03:28:29', '2025-05-29', '2025-05-29 10:04:25', '2025-05-30 03:28:29'),
(83, 3, 'marketing-images', 1, '2025-06-03 06:29:54', '2025-06-03', '2025-06-03 06:29:54', '2025-06-03 06:29:54'),
(84, 3, 'clothing-simulation', 1, '2025-06-03 06:33:36', '2025-06-03', '2025-06-03 06:33:36', '2025-06-03 06:33:36');


--
-- 表结构 `image_histories`
--

DROP TABLE IF EXISTS `image_histories`;
CREATE TABLE `image_histories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `userId` int(11) DEFAULT NULL COMMENT '用户ID，可为空表示未登录用户',
  `originalImageUrl` text DEFAULT NULL COMMENT '原始图片URL',
  `processedImageUrl` text DEFAULT NULL COMMENT '处理后的图片URL',
  `processType` varchar(50) DEFAULT '图片处理' COMMENT '处理类型：图片翻译、营销图生成等',
  `processTime` datetime DEFAULT NULL COMMENT '处理时间',
  `description` text DEFAULT NULL COMMENT '处理描述',
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '额外元数据，如语言设置、处理参数等' CHECK (json_valid(`metadata`)),
  `createdAt` datetime NOT NULL COMMENT '创建时间',
  `updatedAt` datetime NOT NULL COMMENT '更新时间',
  `title` varchar(255) NOT NULL DEFAULT '未命名图片' COMMENT '图片标题',
  `imageUrl` text NOT NULL COMMENT '图片URL（可能是原始图片或处理后的图片）',
  `type` varchar(50) NOT NULL DEFAULT 'IMAGE_EDIT' COMMENT '图片类型：IMAGE_EDIT、TEXT_TO_VIDEO、IMAGE_TO_VIDEO等',
  PRIMARY KEY (`id`),
  KEY `idx_image_histories_user_id` (`userId`),
  KEY `idx_image_histories_process_type` (`processType`),
  KEY `idx_image_histories_process_time` (`processTime`),
  KEY `idx_image_histories_type` (`type`),
  KEY `idx_image_histories_created_at` (`createdAt`)
) ENGINE=InnoDB AUTO_INCREMENT=69 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- 转存表中的数据 `image_histories`
--

INSERT INTO `image_histories` VALUES
(3, NULL, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250425/1511509c4e684a378841af8392c27cec5f1196/editor_1745565110694.png?Expires=1745651510&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=EPvmu%2FblUz9eoTmzmITBIvMMYZY%3D', '图片翻译', '2025-04-25 07:11:51', '图片翻译处理结果', '{}', '2025-04-25 07:11:51', '2025-04-25 07:11:51', '未命名图片', '', 'IMAGE_EDIT'),
(7, NULL, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/cutout/20250425/162756340e9aa28c5140ae92439d29f3b393c5/121212.jpg?Expires=1745656076&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=5qLvMWoITfMNG9T2BDvL%2BIiHClQ%3D&x-oss-process=image%2Fresize%2Cw_443%2Ch_600', '商品换背景', '2025-04-25 08:28:08', '商品换背景处理结果', '{}', '2025-04-25 08:28:08', '2025-04-25 08:28:08', '未命名图片', '', 'IMAGE_EDIT'),
(10, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/scene/20250425/163936c53b51e1f02d45839a9bdc9e549eadfe/121212.jpg?Expires=1745656776&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=FUJuWpqg%2FOHzvxfWG3WVJVNa%2B40%3D&x-oss-process=image%2Fresize%2Cw_443%2Ch_600', 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250425/164014021db076b9cb441fb190bf088795264b/editor_1745570413711.png?Expires=1745656814&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=AU1YlE5iLJqpuWF832tA1OGYZNg%3D', '场景图生成', '2025-04-25 08:40:14', '场景图生成结果', '{}', '2025-04-25 08:40:14', '2025-04-25 08:40:14', '未命名图片', '', 'IMAGE_EDIT'),
(12, NULL, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250425/165141e6c597c777a34f1c8c7bcc113eb8b012/editor_1745571101601.png?Expires=1745657501&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=DKkD1PsZ3%2BecWzavQSmPD03eIqk%3D', '场景图生成', '2025-04-25 08:51:42', '场景图生成结果', '{}', '2025-04-25 08:51:42', '2025-04-25 08:51:42', '未命名图片', '', 'IMAGE_EDIT'),
(16, NULL, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250425/172447804f00c8ed1549a0a3ebd5430d951fb5/editor_1745573086865.png?Expires=1745659487&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=qkIu62C0xbNYMBpPe3Ge%2BoxLrgU%3D', '图像智能消除', '2025-04-25 09:24:47', '图像智能消除处理结果', '{}', '2025-04-25 09:24:47', '2025-04-25 09:24:47', '未命名图片', '', 'IMAGE_EDIT'),
(23, NULL, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250426/09452904146749e50148bb8c5d25439922e453/editor_1745631926752.png?Expires=1745718329&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=QR%2BG9ukGDnnh7rBS80uojQItnDA%3D', '图片翻译', '2025-04-26 01:45:27', '图片翻译处理结果', '{}', '2025-04-26 01:45:27', '2025-04-26 01:45:27', '未命名图片', '', 'IMAGE_EDIT'),
(40, 4, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250426/105557f81346d004884d9283f5e8df6b37222f/editor_1745636157112.png?Expires=1745722557&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=H1%2Fbxr0JnOUAY3xTcAT1DMQ8HCI%3D', '营销图生成', '2025-04-26 02:55:58', '营销图生成结果', '{}', '2025-04-26 02:55:58', '2025-04-26 02:55:58', '未命名图片', '', 'IMAGE_EDIT'),
(41, 4, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250426/110725090eadedeb57469397c906e4f36821ca/editor_1745636845655.png?Expires=1745723246&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=ASfzbeJHZWPTKF9dVodkrSVO7gE%3D', '商品换背景', '2025-04-26 03:07:26', '商品换背景处理结果', '{}', '2025-04-26 03:07:26', '2025-04-26 03:07:26', '未命名图片', '', 'IMAGE_EDIT'),
(42, NULL, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250426/11170044af0c329579477c896d247874bd8033/editor_1745637420180.png?Expires=1745723820&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=0bQx2Q1LUQs8t8%2B1Zpog0oALsKI%3D', '场景图生成', '2025-04-26 03:17:00', '场景图生成结果', '{}', '2025-04-26 03:17:00', '2025-04-26 03:17:00', '未命名图片', '', 'IMAGE_EDIT'),
(43, 4, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250426/11285129896e9f812a42ae91dbe7205947e0bc/editor_1745638131347.png?Expires=1745724531&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=L9dN7dO5jTZyvW7YdCqLoaN9XyY%3D', '场景图生成', '2025-04-26 03:28:52', '场景图生成结果', '{}', '2025-04-26 03:28:52', '2025-04-26 03:28:52', '未命名图片', '', 'IMAGE_EDIT'),
(44, NULL, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250426/113024e636bfd9feec4fec935a527489bcbc8a/editor_1745638223900.png?Expires=1745724624&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=WtDYqRmU6JwBWYAyKl7NhRtBgyk%3D', '图像智能消除', '2025-04-26 03:30:24', '图像智能消除处理结果', '{}', '2025-04-26 03:30:24', '2025-04-26 03:30:24', '未命名图片', '', 'IMAGE_EDIT'),
(45, NULL, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250426/113508c4a31d9d809e4d97a5b745052dc4c4ed/editor_1745638507761.png?Expires=1745724908&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=nlBrUHrT%2Fr7QekT6uA4pMJeoo08%3D', '图像智能消除', '2025-04-26 03:35:08', '图像智能消除处理结果', '{}', '2025-04-26 03:35:08', '2025-04-26 03:35:08', '未命名图片', '', 'IMAGE_EDIT'),
(46, 4, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250426/1137032bc235d36387444bb9f0c79b8881f288/editor_1745638622764.png?Expires=1745725023&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=xPQQLaWwwICmpD3HY7OyHjqL%2BZg%3D', '图像智能消除', '2025-04-26 03:37:03', '图像智能消除处理结果', '{}', '2025-04-26 03:37:03', '2025-04-26 03:37:03', '未命名图片', '', 'IMAGE_EDIT'),
(47, 4, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250426/1139051ff7c1bba0ce486488140b4e58d719bf/editor_1745638745018.png?Expires=1745725145&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=%2FYujGulKxm33R3j9lmkZNw4G8aA%3D', '模特换肤', '2025-04-26 03:39:06', '模特换肤处理结果', '{}', '2025-04-26 03:39:06', '2025-04-26 03:39:06', '未命名图片', '', 'IMAGE_EDIT'),
(48, 4, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250426/114050aa0d4e0a36924122b1b691ae2815021f/editor_1745638849921.png?Expires=1745725250&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=4RrR73keVOctq1Vov1bBz%2Bre3UY%3D', '模拟试衣', '2025-04-26 03:40:50', '模拟试衣处理结果', '{}', '2025-04-26 03:40:50', '2025-04-26 03:40:50', '未命名图片', '', 'IMAGE_EDIT'),
(51, NULL, 'http://kjdsai2025.oss-cn-shanghai.aliyuncs.com/image-upscaler/7389d28d-1dc1-4ff3-8484-83a49c520740.jpg', 'https://aib-image.oss-ap-southeast-1.aliyuncs.com/ppc-records%2Fimage-superrs%2F67eb2a96-2336-11f0-9bea-00163e14fe14.jpg?OSSAccessKeyId=LTAI5t75Zk154w1Ne1UmpHKJ&Expires=4962409702&Signature=XBmvO907RPzweDKI8Sdnu9ZDpsI%3D', '图像高清放大', '2025-04-27 07:08:24', '图像放大2倍结果', '{}', '2025-04-27 07:08:24', '2025-04-27 07:08:24', '未命名图片', '', 'IMAGE_EDIT'),
(59, 1, NULL, 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/93/20250507/b480ba54/d4ae9791-77fe-49fa-9645-c7e112788ff3-1.png?Expires=1746670458&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=1%2FQOQqxXe%2F74YoELrJSy%2FlGRWks%3D', '图像指令编辑', '2025-05-07 02:14:40', '一只小猫躺在床上', NULL, '2025-05-07 02:14:40', '2025-05-07 02:14:40', '智能扩图: 一只小猫躺在床上', 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/93/20250507/b480ba54/d4ae9791-77fe-49fa-9645-c7e112788ff3-1.png?Expires=1746670458&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=1%2FQOQqxXe%2F74YoELrJSy%2FlGRWks%3D', 'IMAGE_EXPANSION'),
(60, 1, NULL, 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/02/20250507/b480ba54/4426278a-be97-4471-be63-009e92d7a2a2-1.png?Expires=1746696071&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=kKe%2BmnMSRMqG9JqA8z%2BVPikV%2BzM%3D', '图像指令编辑', '2025-05-07 09:21:44', '蓝色背景红色叶子', NULL, '2025-05-07 09:21:44', '2025-05-07 09:21:44', '图像上色: 蓝色背景红色叶子', 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/02/20250507/b480ba54/4426278a-be97-4471-be63-009e92d7a2a2-1.png?Expires=1746696071&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=kKe%2BmnMSRMqG9JqA8z%2BVPikV%2BzM%3D', 'IMAGE_COLORIZATION'),
(61, 1, NULL, 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/63/20250508/8928fb36/50a4c698-6edb-42a7-9da8-478ba4b4701a2130861072.png?Expires=1746760295&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=mOlvuMPPTyvt4c0neAa0aXtEUiI%3D', '图像指令编辑', '2025-05-08 03:11:46', '雪地，白色小教堂，极光，冬日场景，柔和的光线', NULL, '2025-05-08 03:11:46', '2025-05-08 03:11:46', '文生图片: 雪地，白色小教堂，极光，冬日场景，柔和的光线', 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/63/20250508/8928fb36/50a4c698-6edb-42a7-9da8-478ba4b4701a2130861072.png?Expires=1746760295&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=mOlvuMPPTyvt4c0neAa0aXtEUiI%3D', 'TEXT_TO_IMAGE'),
(62, 1, NULL, 'http://vibktprfx-prod-prod-aic-vd-cn-shanghai.oss-cn-shanghai.aliyuncs.com/eas-cloth_segmentation/2025-05-09/287c76b1-dbf3-4ef6-91b8-6d427c8f424d/clothes_image.png?OSSAccessKeyId=LTAI4G45u1DBkiaLMWCLJwrF&Expires=1746764763&Signature=OQT8djsp4MDCynzM255wvsOeQL0%3D', '图像指令编辑', '2025-05-09 03:26:08', '', NULL, '2025-05-09 03:26:08', '2025-05-09 03:26:08', '服饰分割结果', 'http://vibktprfx-prod-prod-aic-vd-cn-shanghai.oss-cn-shanghai.aliyuncs.com/eas-cloth_segmentation/2025-05-09/287c76b1-dbf3-4ef6-91b8-6d427c8f424d/clothes_image.png?OSSAccessKeyId=LTAI4G45u1DBkiaLMWCLJwrF&Expires=1746764763&Signature=OQT8djsp4MDCynzM255wvsOeQL0%3D', 'clothing-segmentation'),
(63, 1, NULL, 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/19/20250509/b480ba54/ca12cc0e-50ec-4f33-af2a-1cdce3b746dd-1.png?Expires=1746859613&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=tRLRMjN%2BSuHwlUv1zpsBjkao5PI%3D', '图像指令编辑', '2025-05-09 06:47:57', '', NULL, '2025-05-09 06:47:57', '2025-05-09 06:47:57', '全局风格化结果', 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/19/20250509/b480ba54/ca12cc0e-50ec-4f33-af2a-1cdce3b746dd-1.png?Expires=1746859613&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=tRLRMjN%2BSuHwlUv1zpsBjkao5PI%3D', 'global-style'),
(65, 3, NULL, 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250516/1526439cd1c81db6274c9d949c299411c7603f/editor_1747380402999.png?Expires=1747466803&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=Iq9onfjiG%2BIhqKwOZlRZ%2FJV4Oj8%3D', '图片翻译', '2025-05-16 07:26:43', '图片翻译处理结果', '{}', '2025-05-16 07:26:43', '2025-05-16 07:26:43', '未命名图片', 'https://nhci-editor-sg.oss-accelerate.aliyuncs.com/iframe/502592/compose/20250516/1526439cd1c81db6274c9d949c299411c7603f/editor_1747380402999.png?Expires=1747466803&OSSAccessKeyId=LTAI5tQscCMKL8fkacJQ9Gei&Signature=Iq9onfjiG%2BIhqKwOZlRZ%2FJV4Oj8%3D', 'IMAGE_EDIT'),
(66, 3, NULL, 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/38/20250516/b480ba54/0c14fa58-76ee-4cb5-a2ea-dfe177978f1b-1.png?Expires=1747466902&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=4TqxTkRoos5JKb4ZJKGSOvvE6iA%3D', '图像指令编辑', '2025-05-16 07:28:26', '小猫躺在床上', NULL, '2025-05-16 07:28:26', '2025-05-16 07:28:26', '智能扩图: 小猫躺在床上', 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/38/20250516/b480ba54/0c14fa58-76ee-4cb5-a2ea-dfe177978f1b-1.png?Expires=1747466902&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=4TqxTkRoos5JKb4ZJKGSOvvE6iA%3D', 'IMAGE_EXPANSION'),
(67, 3, 'blob:http://localhost:8080/62d94e67-960a-479c-afa2-cc428d11284a', 'https://aib-image.oss-ap-southeast-1.aliyuncs.com/ppc-records%2Fimage-superrs%2F3d8150f6-32c6-11f0-ac38-00163e11dc99.jpg?OSSAccessKeyId=LTAI5t75Zk154w1Ne1UmpHKJ&Expires=4964120746&Signature=ZHDvO57xcu%2B9eSmx2bdp%2F6sNlss%3D', '图像高清放大', '2025-05-17 02:25:52', '图像放大2倍结果', '{}', '2025-05-17 02:25:52', '2025-05-17 02:25:52', '未命名图片', 'https://aib-image.oss-ap-southeast-1.aliyuncs.com/ppc-records%2Fimage-superrs%2F3d8150f6-32c6-11f0-ac38-00163e11dc99.jpg?OSSAccessKeyId=LTAI5t75Zk154w1Ne1UmpHKJ&Expires=4964120746&Signature=ZHDvO57xcu%2B9eSmx2bdp%2F6sNlss%3D', 'IMAGE_EDIT'),
(68, 3, NULL, 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/09/20250524/b480ba54/a2cd6fe9-ba21-4c85-8612-26ba760f9c13-1.png?Expires=1748139216&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=XREZURrgvBQXFJe93Bi44ooFLuk%3D', '图像指令编辑', '2025-05-24 02:14:07', '卡通形象小心翼翼地探出头，窥视着房间内一颗璀璨的蓝色宝石。', NULL, '2025-05-24 02:14:07', '2025-05-24 02:14:07', '垫图: 卡通形象小心翼翼地探出头，窥视着房间内一颗璀璨的蓝色宝石。', 'https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/1d/09/20250524/b480ba54/a2cd6fe9-ba21-4c85-8612-26ba760f9c13-1.png?Expires=1748139216&OSSAccessKeyId=LTAI5tKPD3TMqf2Lna1fASuh&Signature=XREZURrgvBQXFJe93Bi44ooFLuk%3D', 'DIANTU');


--
-- 表结构 `payment_orders`
--

DROP TABLE IF EXISTS `payment_orders`;
CREATE TABLE `payment_orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `order_number` varchar(50) NOT NULL,
  `amount` int(11) NOT NULL COMMENT '充值积分金额',
  `price` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT '人民币金额',
  `status` enum('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  `payment_method` enum('alipay','wechat','bank') NOT NULL,
  `transaction_id` varchar(100) DEFAULT NULL COMMENT '第三方支付交易ID',
  `payment_time` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `qrcode_expire_time` datetime DEFAULT NULL COMMENT '二维码过期时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_number` (`order_number`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `payment_orders_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- 转存表中的数据 `payment_orders`
--

INSERT INTO `payment_orders` VALUES
(1, 3, 'AL1747707969662535', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 02:26:09', '2025-05-20 02:26:09', NULL),
(2, 3, 'AL1747707976756636', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 02:26:16', '2025-05-20 02:26:16', NULL),
(3, 3, 'AL1747708196906842', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 02:29:56', '2025-05-20 02:29:56', NULL),
(4, 3, 'AL1747708866734420', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 02:41:06', '2025-05-20 02:41:06', NULL),
(5, 3, 'AL1747709188413692', 198, '59.00', 'failed', 'alipay', NULL, NULL, '2025-05-20 02:46:28', '2025-05-20 02:46:28', NULL),
(6, 3, 'AL1747709197338124', 198, '59.00', 'failed', 'alipay', NULL, NULL, '2025-05-20 02:46:37', '2025-05-20 02:46:37', NULL),
(7, 3, 'AL1747709308099151', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 02:48:28', '2025-05-20 02:48:28', NULL),
(8, 3, 'AL1747709647591110', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 02:54:07', '2025-05-20 02:54:07', NULL),
(9, 3, 'AL1747709815290659', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 02:56:55', '2025-05-20 02:56:55', NULL),
(10, 3, 'AL174770987606980', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 02:57:56', '2025-05-20 02:57:56', NULL),
(11, 3, 'AL1747710383618184', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 03:06:23', '2025-05-20 03:06:23', NULL),
(12, 3, 'AL1747711675985595', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 03:27:55', '2025-05-20 03:27:55', NULL),
(13, 3, 'AL1747712218580802', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 03:36:58', '2025-05-20 03:36:58', NULL),
(14, 3, 'AL1747712368179898', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 03:39:28', '2025-05-20 03:39:28', NULL),
(15, 3, 'AL1747712463002824', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 03:41:03', '2025-05-20 03:41:03', NULL),
(16, 3, 'AL1747712524179108', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 03:42:04', '2025-05-20 03:42:04', NULL),
(17, 3, 'AL1747713081691401', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 03:51:21', '2025-05-20 03:51:21', NULL),
(18, 3, 'AL1747713141045656', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 03:52:21', '2025-05-20 03:52:21', NULL),
(19, 3, 'AL1747713289936340', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 03:54:49', '2025-05-20 03:54:49', NULL),
(20, 3, 'AL1747713495507848', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 03:58:15', '2025-05-20 03:58:15', NULL),
(21, 3, 'AL1747719969997859', 800, '99.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 05:46:09', '2025-05-20 05:46:09', NULL),
(22, 3, 'AL174772019842010', 3980, '399.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 05:49:58', '2025-05-20 05:49:58', NULL),
(23, 3, 'AL1747720354053861', 6730, '599.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 05:52:34', '2025-05-20 05:52:34', NULL),
(24, 3, 'AL1747720447164181', 12500, '999.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 05:54:07', '2025-05-20 05:54:07', NULL),
(25, 3, 'AL174772067746474', 12500, '999.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 05:57:57', '2025-05-20 05:57:57', NULL),
(26, 3, 'AL1747720996176532', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 06:03:16', '2025-05-20 06:03:16', NULL),
(27, 3, 'AL1747722471782285', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 06:27:51', '2025-05-20 06:27:51', NULL),
(28, 3, 'AL1747722555538644', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 06:29:15', '2025-05-20 06:29:15', NULL),
(29, 3, 'AL1747722736866211', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 06:32:16', '2025-05-20 06:32:16', NULL),
(30, 3, 'AL1747722790700509', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 06:33:10', '2025-05-20 06:33:10', NULL),
(31, 3, 'AL1747723096005488', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 06:38:16', '2025-05-20 06:38:16', NULL),
(32, 3, 'AL1747723921816719', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 06:52:01', '2025-05-20 06:52:01', '2025-05-20 07:07:01'),
(33, 3, 'AL1747724012555778', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 06:53:32', '2025-05-20 06:53:32', '2025-05-20 07:08:32'),
(34, 3, 'AL1747726126433701', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-20 07:28:46', '2025-05-20 07:28:46', '2025-05-20 07:43:46'),
(35, 1, 'TEST1001', 198, '59.00', 'completed', 'alipay', 'TX1001', '2025-05-30 07:40:16', '2025-05-30 07:40:16', '2025-05-30 07:40:16', NULL),
(36, 1, 'TEST1002', 800, '99.00', 'completed', 'wechat', 'TX1002', '2025-05-30 07:41:29', '2025-05-30 07:41:29', '2025-05-30 07:41:29', NULL),
(37, 1, 'TEST1003', 3980, '399.00', 'completed', 'alipay', 'TX1003', '2025-05-30 07:41:43', '2025-05-30 07:41:43', '2025-05-30 07:41:43', NULL),
(38, 3, 'AL1748596569972154', 198, '59.00', 'pending', 'alipay', NULL, NULL, '2025-05-30 09:16:09', '2025-05-30 09:16:09', '2025-05-30 09:31:09');


--
-- 表结构 `users`
--

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(100) NOT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `credits` int(11) NOT NULL DEFAULT 0,
  `lastRechargeTime` datetime DEFAULT NULL,
  `smsCode` varchar(10) DEFAULT NULL,
  `smsCodeExpires` datetime DEFAULT NULL,
  `isAdmin` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username_UNIQUE` (`username`),
  UNIQUE KEY `phone_UNIQUE` (`phone`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- 转存表中的数据 `users`
--

INSERT INTO `users` VALUES
(1, 'lili1119', '$2b$10$jzjcRv/ooF1ZhFG8E38hvebIZOa5TDZzV2Ip2q.LaXfFufHXDtoym', '2025-04-23 02:27:01', '2025-05-09 07:18:56', NULL, 735, NULL, NULL, NULL, 0),
(3, 'lilili1119', '$2b$10$OiiCSoyxIs3BQ7c0RUSYU.x9YfzEeTf7px6GMfcGHYTCqkHhaX8g6', '2025-04-24 08:22:55', '2025-05-30 08:52:58', '18237164080', 193, '2025-05-22 01:09:14', NULL, NULL, 1),
(4, 'realuser', '$2b$10$YGr2TlgK3yUcj2q4Ky6CruhvjbNKSLvf5/knZMnM05pDeoYJSU81S', '2025-04-25 02:08:43', '2025-04-26 03:50:06', NULL, 9870, NULL, NULL, NULL, 0),
(5, 'qwer', '$2b$10$REkQ0is.F9.ozfJxYtPYfOdNye2ndyylAWc9aXLrlR4/pJ/csCc0K', '2025-04-28 01:40:56', '2025-05-06 01:07:56', '15137192630', 0, NULL, NULL, NULL, 0),
(6, 'user_2030', '$2b$10$hhqsSo2dfRy5vWNCOQ3z2.udYosJaYYxNLdYCBBz4FRnrKxRK64lC', '2025-05-06 01:05:39', '2025-05-06 01:05:39', '15137192030', 0, NULL, '612615', '2025-05-06 01:10:39', 0),
(8, 'admin', '$2b$10$Av9fHPjoqPs8QaJDdKOXIOppixIJHXxpurFX4pRXQj25k1OZc3F2e', '2025-05-30 06:04:12', '2025-05-30 06:04:12', NULL, 1000, NULL, NULL, NULL, 1);


SET FOREIGN_KEY_CHECKS = 1;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

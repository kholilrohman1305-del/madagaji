-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: gaji
-- ------------------------------------------------------
-- Server version	8.0.30

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activities`
--

DROP TABLE IF EXISTS `activities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `activities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `name` varchar(150) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activities_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activities`
--

LOCK TABLES `activities` WRITE;
/*!40000 ALTER TABLE `activities` DISABLE KEYS */;
/*!40000 ALTER TABLE `activities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `activity_teachers`
--

DROP TABLE IF EXISTS `activity_teachers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `activity_teachers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `activity_id` int NOT NULL,
  `teacher_id` varchar(10) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_activity_teacher` (`activity_id`,`teacher_id`),
  KEY `idx_at_teacher` (`teacher_id`),
  CONSTRAINT `fk_at_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_at_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_teachers`
--

LOCK TABLES `activity_teachers` WRITE;
/*!40000 ALTER TABLE `activity_teachers` DISABLE KEYS */;
/*!40000 ALTER TABLE `activity_teachers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `announcements`
--

DROP TABLE IF EXISTS `announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `announcements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `content` text,
  `target_role` varchar(50) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_ann_user` (`created_by`),
  CONSTRAINT `fk_ann_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `announcements`
--

LOCK TABLES `announcements` WRITE;
/*!40000 ALTER TABLE `announcements` DISABLE KEYS */;
/*!40000 ALTER TABLE `announcements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance`
--

DROP TABLE IF EXISTS `attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `attendance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `teacher_id` varchar(10) DEFAULT NULL,
  `date` date NOT NULL,
  `period` varchar(50) NOT NULL,
  `class_id` int NOT NULL,
  `status` varchar(20) NOT NULL,
  `hour_count` int NOT NULL DEFAULT '0',
  `recorded_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_attendance` (`teacher_id`,`class_id`,`period`,`date`),
  KEY `idx_attendance_date` (`date`),
  KEY `idx_attendance_teacher` (`teacher_id`),
  CONSTRAINT `fk_attendance_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance`
--

LOCK TABLES `attendance` WRITE;
/*!40000 ALTER TABLE `attendance` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `budget`
--

DROP TABLE IF EXISTS `budget`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `budget` (
  `id` int NOT NULL AUTO_INCREMENT,
  `academic_year_id` int NOT NULL,
  `category` varchar(100) NOT NULL,
  `planned_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_budget_year` (`academic_year_id`),
  CONSTRAINT `fk_budget_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `budget`
--

LOCK TABLES `budget` WRITE;
/*!40000 ALTER TABLE `budget` DISABLE KEYS */;
/*!40000 ALTER TABLE `budget` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `budget_transactions`
--

DROP TABLE IF EXISTS `budget_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `budget_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `budget_id` int NOT NULL,
  `date` date NOT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `type` enum('income','expense') NOT NULL,
  `description` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_bt_budget` (`budget_id`),
  CONSTRAINT `fk_bt_budget` FOREIGN KEY (`budget_id`) REFERENCES `budget` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `budget_transactions`
--

LOCK TABLES `budget_transactions` WRITE;
/*!40000 ALTER TABLE `budget_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `budget_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `class_subject_rules`
--

DROP TABLE IF EXISTS `class_subject_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `class_subject_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `class_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `allowed` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_class_subject` (`class_id`,`subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `class_subject_rules`
--

LOCK TABLES `class_subject_rules` WRITE;
/*!40000 ALTER TABLE `class_subject_rules` DISABLE KEYS */;
/*!40000 ALTER TABLE `class_subject_rules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `class_subjects`
--

DROP TABLE IF EXISTS `class_subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `class_subjects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `class_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `hours_per_week` int NOT NULL DEFAULT '2',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_class_subject` (`class_id`,`subject_id`),
  KEY `idx_class_subjects` (`class_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `class_subjects`
--

LOCK TABLES `class_subjects` WRITE;
/*!40000 ALTER TABLE `class_subjects` DISABLE KEYS */;
/*!40000 ALTER TABLE `class_subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `classes`
--

DROP TABLE IF EXISTS `classes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `classes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `grade_level` int DEFAULT NULL,
  `homeroom_teacher_id` varchar(10) DEFAULT NULL,
  `academic_year_id` int DEFAULT NULL,
  `max_students` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_classes_teacher` (`homeroom_teacher_id`),
  KEY `fk_classes_year` (`academic_year_id`),
  CONSTRAINT `fk_classes_teacher` FOREIGN KEY (`homeroom_teacher_id`) REFERENCES `teachers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_classes_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `classes`
--

LOCK TABLES `classes` WRITE;
/*!40000 ALTER TABLE `classes` DISABLE KEYS */;
/*!40000 ALTER TABLE `classes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `duty_roster`
--

DROP TABLE IF EXISTS `duty_roster`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `duty_roster` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `duty_roster`
--

LOCK TABLES `duty_roster` WRITE;
/*!40000 ALTER TABLE `duty_roster` DISABLE KEYS */;
/*!40000 ALTER TABLE `duty_roster` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `expense_categories`
--

DROP TABLE IF EXISTS `expense_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `expense_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `expense_categories`
--

LOCK TABLES `expense_categories` WRITE;
/*!40000 ALTER TABLE `expense_categories` DISABLE KEYS */;
/*!40000 ALTER TABLE `expense_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `expenses`
--

DROP TABLE IF EXISTS `expenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `expenses` (
  `id` varchar(10) NOT NULL,
  `date` date NOT NULL,
  `category` varchar(50) NOT NULL,
  `recipient` varchar(100) NOT NULL DEFAULT '',
  `quantity` int NOT NULL DEFAULT '1',
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_expenses_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `expenses`
--

LOCK TABLES `expenses` WRITE;
/*!40000 ALTER TABLE `expenses` DISABLE KEYS */;
/*!40000 ALTER TABLE `expenses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `guru`
--

DROP TABLE IF EXISTS `guru`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `guru` (
  `guru_id` varchar(10) NOT NULL,
  `kode` varchar(50) DEFAULT NULL,
  `nama` varchar(100) NOT NULL,
  `klasifikasi` varchar(50) DEFAULT NULL,
  `tmt` int DEFAULT NULL,
  `tugas_ids` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`guru_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `guru`
--

LOCK TABLES `guru` WRITE;
/*!40000 ALTER TABLE `guru` DISABLE KEYS */;
INSERT INTO `guru` VALUES ('25',NULL,'Didik Samsul Hadi, M.Pd.I','Sertifikasi',1992,''),('43',NULL,'KHM. Charish Sr','Non Sertifikasi',1979,''),('47',NULL,'KM. Sholihin S.Pd.','Sertifikasi',1995,''),('69',NULL,'Umi Nadliroh','Non Sertifikasi',2007,'');
/*!40000 ALTER TABLE `guru` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `holidays`
--

DROP TABLE IF EXISTS `holidays`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `holidays` (
  `date` date NOT NULL,
  `description` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `holidays`
--

LOCK TABLES `holidays` WRITE;
/*!40000 ALTER TABLE `holidays` DISABLE KEYS */;
/*!40000 ALTER TABLE `holidays` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `honor_tugas`
--

DROP TABLE IF EXISTS `honor_tugas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `honor_tugas` (
  `tugas_id` varchar(10) NOT NULL,
  `nama` varchar(100) NOT NULL,
  `nominal` decimal(12,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`tugas_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `honor_tugas`
--

LOCK TABLES `honor_tugas` WRITE;
/*!40000 ALTER TABLE `honor_tugas` DISABLE KEYS */;
/*!40000 ALTER TABLE `honor_tugas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory`
--

DROP TABLE IF EXISTS `inventory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(80) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
  `category` varchar(100) DEFAULT '',
  `total_quantity` int NOT NULL DEFAULT '0',
  `available_quantity` int NOT NULL DEFAULT '0',
  `condition` varchar(50) DEFAULT 'good',
  `location` varchar(150) DEFAULT '',
  `purchase_date` date DEFAULT NULL,
  `purchase_price` decimal(12,2) DEFAULT '0.00',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory`
--

LOCK TABLES `inventory` WRITE;
/*!40000 ALTER TABLE `inventory` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_transactions`
--

DROP TABLE IF EXISTS `inventory_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `inventory_id` int NOT NULL,
  `type` enum('loan','return','adjustment') NOT NULL,
  `borrower` varchar(150) DEFAULT NULL,
  `borrower_id` int DEFAULT NULL,
  `loan_date` date DEFAULT NULL,
  `expected_return_date` date DEFAULT NULL,
  `actual_return_date` date DEFAULT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_it_inventory` (`inventory_id`),
  CONSTRAINT `fk_it_inventory` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_transactions`
--

LOCK TABLES `inventory_transactions` WRITE;
/*!40000 ALTER TABLE `inventory_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `jadwal`
--

DROP TABLE IF EXISTS `jadwal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `jadwal` (
  `id` varchar(10) NOT NULL,
  `hari` varchar(10) NOT NULL,
  `jam_ke` varchar(20) NOT NULL,
  `kelas` varchar(20) NOT NULL,
  `mapel_id` varchar(10) DEFAULT NULL,
  `guru_id` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_jadwal_kelas` (`hari`,`jam_ke`,`kelas`),
  KEY `idx_jadwal_hari` (`hari`),
  KEY `idx_jadwal_guru` (`guru_id`),
  KEY `idx_jadwal_kelas` (`kelas`),
  KEY `fk_jadwal_mapel` (`mapel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `jadwal`
--

LOCK TABLES `jadwal` WRITE;
/*!40000 ALTER TABLE `jadwal` DISABLE KEYS */;
INSERT INTO `jadwal` VALUES ('J001','Senin','1','2','24','62'),('J002','Senin','2','2','24','62'),('J003','Senin','4','2','9','53'),('J004','Senin','7','2','35','12'),('J005','Senin','2','3','24','62'),('J006','Senin','1','12','31','73'),('J007','Senin','1','15','31','28'),('J008','Senin','1','18','1','74'),('J009','Senin','1','22','10','67'),('J010','Senin','1','25','20','17'),('J011','Senin','1','28','2','38'),('J012','Senin','1','6','15','22'),('J013','Senin','3','2','9','53'),('J014','Senin','5','2','22','22'),('J015','Senin','1','5','24','31'),('J016','Senin','2','5','24','31'),('J017','Senin','1','8','22','54'),('J018','Senin','2','8','22','54'),('J019','Senin','1','11','16','60'),('J020','Senin','1','13','36','19'),('J021','Senin','2','13','36','19'),('J022','Senin','2','14','1','11'),('J023','Senin','1','16','33','40'),('J024','Senin','2','16','33','40'),('J025','Senin','2','18','1','74'),('J026','Senin','2','19','6','14'),('J027','Senin','2','22','10','67'),('J028','Senin','1','24','27','53'),('J029','Senin','2','25','20','17'),('J030','Senin','2','28','9','71'),('J031','Senin','2','6','15','22'),('J032','Senin','1','7','15','47'),('J033','Senin','2','7','15','47'),('J034','Senin','1','14','8','11'),('J035','Senin','1','17','26','13'),('J036','Senin','2','17','26','13'),('J037','Senin','2','21','9','52'),('J038','Senin','2','11','16','60'),('J039','Senin','1','21','9','52'),('J040','Senin','1','23','38','29'),('J041','Senin','1','10','19','24'),('J042','Senin','8','2','35','12'),('J043','Senin','6','2','22','22'),('J044','Senin','7','3','9','53'),('J045','Senin','1','3','24','62'),('J046','Senin','4','3','26','29'),('J047','Senin','6','3','15','73'),('J048','Senin','8','3','9','53'),('J049','Senin','3','3','26','29'),('J050','Selasa','4','2','4','33'),('J051','Selasa','5','2','6','75'),('J052','Selasa','4','3','2','47'),('J053','Senin','1','4','24','31'),('J054','Senin','2','4','24','31'),('J055','Senin','1','9','19','24'),('J056','Senin','1','20','16','60'),('J057','Senin','2','20','16','60'),('J058','Senin','1','26','14','43'),('J059','Senin','2','9','19','24'),('J060','Senin','2','15','31','28'),('J061','Senin','2','12','31','73'),('J062','Senin','3','4','1','11'),('J063','Senin','5','4','9','52'),('J064','Senin','4','4','1','11'),('J065','Senin','7','4','7','73'),('J066','Senin','6','4','9','52'),('J067','Senin','8','4','7','73'),('JF4Y3EU5C0','Senin','3','5','31','73'),('JF4Y3FP05D','Senin','4','5','31','73'),('JF4Y3GA7CC','Senin','3','6','13','58'),('JF4Y3GYAC1','Senin','4','6','13','58'),('JF4Y3HF235','Senin','3','7','22','54'),('JF4Y3HX1F4','Senin','4','7','22','54'),('JF4Y3II12E','Senin','3','8','23','51'),('JF4Y3JBEAE','Senin','4','8','23','51'),('JF4Y3JXF8A','Senin','3','9','15','30'),('JF4Y3KK336','Senin','4','9','15','30'),('JF5DUNT022','Senin','2','10','19','24'),('JF5DUOA897','Senin','3','10','6','17'),('JF5DUOL305','Senin','4','10','6','17'),('JF5DUOZDFF','Senin','3','11','24','31'),('JF5DUPH3ED','Senin','4','11','24','31'),('JF5DUPW4C3','Senin','3','20','19','24'),('JF5DUQEC66','Senin','4','20','19','24'),('JF5DUQVB2C','Senin','3','12','24','31'),('JF5DURABC9','Senin','4','12','24','31'),('JF5DURS70D','Senin','3','13','24','62'),('JF5DUS65C9','Senin','4','13','24','62'),('JF5DUSM88C','Senin','3','14','24','62'),('JF5DUT14A1','Senin','4','14','24','62'),('JF5DUTHB78','Senin','3','15','36','40'),('JF5DUTVA2F','Senin','4','15','36','40'),('JF5DUU7950','Senin','3','16','7','69'),('JF5DUUL645','Senin','4','16','7','69'),('JF5DUUZ582','Senin','3','17','31','28'),('JF5DUV9B83','Senin','4','17','31','28'),('JF7AGRFCF4','Senin','5','5','8','11'),('JF7AGRT640','Senin','6','5','8','11'),('JF7AGS66DE','Senin','7','5','15','14'),('JF7AGSIB00','Senin','8','5','15','14'),('JF7AGSV4D7','Senin','5','6','10','74'),('JF7AGT66B0','Senin','6','6','10','74'),('JF7AGTG73A','Senin','7','6','20','17'),('JF7AGTSB72','Senin','8','6','20','17'),('JF7AGU3DB2','Senin','5','7','6','47'),('JF7AGUDCDD','Senin','6','7','6','47'),('JF7AGUP5E9','Senin','7','7','7','4'),('JF7AGV01D8','Senin','8','7','7','4'),('JF7AGVB3AF','Senin','5','8','6','17'),('JF7AGVNFFC','Senin','6','8','6','17'),('JF7AGVY1C2','Senin','7','8','9','71'),('JF7AGW8CC5','Senin','8','8','9','71'),('JF7AGWJFAE','Senin','5','9','2','4'),('JF7AGX3C3C','Senin','6','9','2','4'),('JF7AGXMEFC','Senin','7','9','21','49'),('JF7AGY3D19','Senin','8','9','21','49'),('JF7AGYME83','Senin','5','10','9','71'),('JF7AGZH5A5','Senin','6','10','9','71'),('JF7AGZX3C4','Senin','7','10','26','20'),('JF7AH0AF46','Senin','8','10','26','20'),('JF7TK62AC9','Senin','5','11','18','63'),('JF7TK6YA51','Senin','6','11','18','63'),('JF7TK79986','Senin','7','11','9','52'),('JF7TK7K7F8','Senin','8','11','9','52'),('JF7TK7V149','Senin','5','20','21','51'),('JF7TK86A24','Senin','6','20','21','51'),('JF7TK8HE40','Senin','7','20','1','74'),('JF7TK8S450','Senin','8','20','1','74'),('JF7TK9356D','Senin','5','12','4','14'),('JF7TK9E882','Senin','6','12','16','60'),('JF7TK9Q997','Senin','7','12','22','54'),('JF7TKA11A5','Senin','8','12','22','54'),('JF7TKAB7A0','Senin','5','13','32','16'),('JF7TKAN9F8','Senin','6','13','32','16'),('JF7TKAY790','Senin','7','13','17','67'),('JF7TKBA709','Senin','8','13','17','67'),('JF7TKBL0C7','Senin','5','14','13','58'),('JF7TKBV3B4','Senin','6','14','13','58'),('JF7TKC74B6','Senin','7','14','15','19'),('JF7TKCI1FA','Senin','8','14','15','19'),('JF7TKCSBED','Senin','5','15','7','69'),('JF7TKDG0D4','Senin','6','15','7','69'),('JF7TKDU502','Senin','7','15','26','13'),('JF7TKE5BE2','Senin','8','15','26','13'),('JF7TKEHB43','Senin','5','16','23','29'),('JF7TKER7E9','Senin','6','16','4','14'),('JF7TKF1601','Senin','7','16','13','58'),('JF7TKFB1E2','Senin','8','16','13','58'),('JF7TKFMB0C','Senin','5','17','18','19'),('JF7TKFYBF1','Senin','6','17','18','19'),('JF7TKG9538','Senin','7','17','10','35'),('JF7TKGO8E8','Senin','8','17','10','35'),('JF818XB23C','Senin','3','18','19','24'),('JF818XNA36','Senin','4','18','19','24'),('JF818XZE98','Senin','7','18','12','59'),('JF818YBAFD','Senin','8','18','12','59'),('JF818YN5D3','Senin','1','19','6','14'),('JF818YZ69F','Senin','3','19','19','24'),('JF818Z9C6F','Senin','4','19','19','24'),('JF818ZKE89','Senin','5','19','12','59'),('JF818ZV8FD','Senin','6','19','12','59'),('JF81906688','Senin','7','19','36','40'),('JF8190HB4B','Senin','8','19','36','40'),('JF8190SF60','Senin','3','21','16','60'),('JF81913AEA','Senin','4','21','16','60'),('JF8191EA70','Senin','5','21','10','67'),('JF8191P35F','Senin','6','21','10','67'),('JF81920E40','Senin','7','21','23','25'),('JF8192B30C','Senin','8','21','23','25'),('JF94C8Y42E','Senin','3','22','18','63'),('JF94C99CD6','Senin','4','22','18','63'),('JF94C9K556','Senin','5','22','33','40'),('JF94C9UC63','Senin','6','22','33','40'),('JF94CA556E','Senin','7','22','29','29'),('JF94CAGA4F','Senin','8','22','29','29'),('JF94CARC98','Senin','2','23','38','29'),('JF94CB1316','Senin','3','23','32','16'),('JF94CBB4C2','Senin','4','23','32','16'),('JF94CBMA45','Senin','5','23','15','30'),('JF94CBX4FD','Senin','6','23','15','30'),('JF94CC88AE','Senin','7','23','29','11'),('JF94CCKEEA','Senin','8','23','28','11'),('JF94CCU9FF','Senin','2','24','27','53'),('JF94CD5511','Senin','3','24','38','13'),('JF94CDH21E','Senin','4','24','38','13'),('JF94CDT4F1','Senin','5','24','7','5'),('JF94CE5BB8','Senin','6','24','7','5'),('JF94CEG992','Senin','7','24','3','16'),('JF94CEU9B1','Senin','8','24','3','16'),('JF94CFBC90','Senin','3','25','22','14'),('JF94CFX0E4','Senin','4','25','22','14'),('JF94CGA778','Senin','5','25','26','28'),('JF94CGN750','Senin','6','25','26','28'),('JF94CGYB08','Senin','7','25','16','60'),('JF94CHA4BF','Senin','8','25','16','60'),('JF94CHR9D0','Senin','2','26','14','43'),('JF94CI362F','Senin','4','26','2','38'),('JF94CIF0B4','Senin','5','26','23','38'),('JF94CIQCFD','Senin','6','26','23','38'),('JF94CJ0D27','Senin','7','26','22','22'),('JF94CJB201','Senin','8','26','22','22'),('JF94CJLFF1','Senin','1','27','12','59'),('JF94CJV17E','Senin','2','27','2','38'),('JF94CK50E8','Senin','3','27','14','43'),('JF94CKFB55','Senin','4','27','14','43'),('JF94CKP497','Senin','5','27','30','25'),('JF94CL0062','Senin','6','27','30','25'),('JF94CLAD84','Senin','7','27','5','26'),('JF94CLK7C8','Senin','8','27','5','26'),('JF94CLT871','Senin','3','28','9','71'),('JF94CM4518','Senin','4','28','12','59'),('JF94CMR2EC','Senin','5','28','14','43'),('JF94CN8D13','Senin','6','28','14','43'),('JF94CNKD06','Senin','7','28','21','51'),('JF94CNX099','Senin','8','28','21','51'),('JF94CO74C5','Senin','1','29','7','69'),('JF94COHBF1','Senin','2','29','7','69'),('JF94COS146','Senin','3','29','2','38'),('JF94CP237F','Senin','5','29','5','26'),('JF94CPDC94','Senin','4','29','11','26'),('JF94CPN9EB','Senin','6','29','5','26'),('JF94CQ09DC','Senin','7','29','14','43'),('JF94CQAF8A','Senin','8','29','14','43'),('JF9T4G893C','Selasa','3','2','34','75'),('JF9T4GY3F0','Selasa','6','2','6','75'),('JF9T4HE038','Selasa','7','2','21','10'),('JF9T4HPBFA','Selasa','8','2','21','10'),('JF9T4I025F','Selasa','3','3','4','33'),('JF9T4IAC80','Selasa','5','3','2','47'),('JF9T4IMACF','Selasa','6','3','15','73'),('JF9T4IXB48','Selasa','7','3','15','73'),('JF9T4J916E','Selasa','8','3','34','75'),('JF9T4JL751','Selasa','3','4','31','73'),('JF9T4JV569','Selasa','4','4','31','73'),('JF9T4K614D','Selasa','5','4','32','16'),('JF9T4KH497','Selasa','6','4','32','16'),('JF9T4KS18E','Selasa','7','4','29','34'),('JF9T4L2622','Selasa','8','4','29','34'),('JFB80JQ394','Selasa','3','5','26','36'),('JFB80KJ487','Selasa','4','5','26','36'),('JFB80L3546','Selasa','5','5','17','10'),('JFB80LN696','Selasa','6','5','12','59'),('JFB80M3688','Selasa','7','5','13','58'),('JFB80MJB74','Selasa','8','5','13','58'),('JFB80N0A22','Selasa','3','6','24','31'),('JFB80NI984','Selasa','4','6','24','31'),('JFB80O0D5D','Selasa','5','6','31','28'),('JFB80OGC0B','Selasa','6','6','31','28'),('JFB80OZ771','Selasa','7','6','8','72'),('JFB80PF76A','Selasa','8','6','1','72'),('JFB80PUCBD','Selasa','3','7','24','31'),('JFB80QC135','Selasa','4','7','24','31'),('JFB80QU4AF','Selasa','5','7','4','73'),('JFB80R6FA9','Selasa','6','7','34','49'),('JFB80RPC09','Selasa','7','7','26','20'),('JFB80S8126','Selasa','8','7','26','20'),('JFB80SO515','Selasa','3','8','17','18'),('JFB80T04D2','Selasa','4','8','17','18'),('JFB80TBB42','Selasa','5','8','1','72'),('JFB80TK04A','Selasa','6','8','8','72'),('JFB80TU353','Selasa','7','8','34','49'),('JFB80U3CAF','Selasa','8','8','4','73'),('JFB80UD5D8','Selasa','5','9','29','26'),('JFB80UNDAF','Selasa','6','9','29','26'),('JFB80UXA7E','Selasa','7','9','25','30'),('JFB80V782A','Selasa','8','9','34','49'),('JFB80VHE37','Selasa','3','10','25','30'),('JFB80VR9D3','Selasa','4','10','25','30'),('JFB80W0243','Selasa','5','10','22','13'),('JFB80W9795','Selasa','6','10','22','13'),('JFB80WJB01','Selasa','7','10','15','33'),('JFB80WU7F8','Selasa','8','10','15','33'),('JFB80X3A90','Selasa','1','11','36','19'),('JFB80XB5B4','Selasa','2','11','36','19'),('JFB80XJB01','Selasa','3','11','16','60'),('JFB80XS767','Selasa','4','11','4','14'),('JFB80Y2665','Selasa','5','11','33','39'),('JFB80YUF74','Selasa','6','11','33','39'),('JFB80Z7A92','Selasa','7','11','22','54'),('JFB80ZK841','Selasa','8','11','22','54'),('JFBLQP5E45','Selasa','3','20','9','52'),('JFBLQPI517','Selasa','4','20','9','52'),('JFBLQPZB61','Selasa','5','20','22','22'),('JFBLQQJ0BF','Selasa','6','20','22','22'),('JFBLQQXF39','Selasa','7','20','29','26'),('JFBLQRF9CD','Selasa','8','20','29','26'),('JFBLQRXCFE','Selasa','2','12','16','60'),('JFBLQSBC17','Selasa','3','12','13','58'),('JFBLQST4EB','Selasa','4','12','13','58'),('JFBLQTAF1B','Selasa','5','12','26','29'),('JFROXMB2A8','Selasa','1','12','16','60'),('JFROXMM3E3','Selasa','6','12','26','29'),('JFROXMXE55','Selasa','7','12','33','39'),('JFROXN8FB7','Selasa','8','12','33','39'),('JFROXNJFA6','Selasa','1','13','31','73'),('JFROXNT9E3','Selasa','2','13','31','73'),('JFROXOZ6F6','Selasa','3','13','4','14'),('JFROXP970F','Selasa','4','13','23','29'),('JFROXPJ0BC','Selasa','5','13','15','33'),('JFROXPU25E','Selasa','6','13','15','33'),('JFROXQ4AB9','Selasa','7','13','26','29'),('JFROXQF5DA','Selasa','8','13','26','29'),('JFROXQQ4C0','Selasa','1','14','29','75'),('JFROXR160F','Selasa','2','14','29','75'),('JFROXRCC6E','Selasa','3','14','12','59'),('JFROXRN01E','Selasa','4','14','12','59'),('JFROXRY1BC','Selasa','5','14','36','19'),('JFROXS9AC1','Selasa','6','14','36','19'),('JFROXSLE63','Selasa','7','14','32','74'),('JFROXT0997','Selasa','8','14','32','74'),('JFROXTF4FC','Selasa','1','15','15','33'),('JFROXTT619','Selasa','2','15','15','33'),('JFROXU6D9E','Selasa','3','15','13','41'),('JFROXUJ872','Selasa','4','15','13','41'),('JFROXUX390','Selasa','5','15','2','15'),('JFROXV98A2','Selasa','6','15','2','15'),('JFROXVM82F','Selasa','7','15','10','74'),('JFROXVXA41','Selasa','8','15','10','74'),('JFS0FW9352','Selasa','1','16','9','53'),('JFS0FWNE1A','Selasa','2','16','9','53'),('JFS0FX1352','Selasa','3','16','2','15'),('JFS0FXC67A','Selasa','4','16','2','15'),('JFS0FXOAE2','Selasa','5','16','36','40'),('JFS0FXZ7A0','Selasa','6','16','36','40'),('JFS0FYAFAE','Selasa','7','16','6','19'),('JFS0FYL7B8','Selasa','8','16','6','19'),('JFS0FYV5B4','Selasa','1','17','24','62'),('JFS0FZ6D6F','Selasa','2','17','24','62'),('JFS0FZH145','Selasa','3','17','30','16'),('JFS0FZS147','Selasa','4','17','7','69'),('JFS0G02CA9','Selasa','5','17','7','69'),('JFS0G0E4E6','Selasa','6','17','18','63'),('JFS0G0Q058','Selasa','7','17','18','63'),('JFS0G11622','Selasa','8','17','4','14'),('JFS0G1DFEA','Selasa','1','18','28','35'),('JFS0G1PA1D','Selasa','2','18','28','35'),('JFS0G204DE','Selasa','3','18','26','20'),('JFS0G2BB93','Selasa','4','18','26','20'),('JFS0G2MA82','Selasa','5','18','15','30'),('JFS0G2Z78B','Selasa','6','18','15','30'),('JFS0G3CF09','Selasa','7','18','36','40'),('JFS0G3O82D','Selasa','8','18','36','40'),('JFS0G40DE4','Selasa','1','19','15','30'),('JFS0G4D0B9','Selasa','2','19','15','30'),('JFS0G4QCA7','Selasa','3','19','8','74'),('JFS0G5294A','Selasa','4','19','8','74'),('JFS0G5F173','Selasa','5','19','17','18'),('JFS0G5S5A8','Selasa','6','19','17','18'),('JFS0G6591E','Selasa','7','19','4','14'),('JFS0G6G0BB','Selasa','8','19','23','50'),('JFSHV2U9D0','Selasa','1','21','38','22'),('JFSHV3RD24','Selasa','2','21','38','22'),('JFSHV42D6E','Selasa','3','21','26','42'),('JFSHV4HCA7','Selasa','4','21','26','42'),('JFSHV4T744','Selasa','5','21','5','4'),('JFSHV52F76','Selasa','6','21','5','4'),('JFSHV5D21F','Selasa','7','21','22','22'),('JFSHV5N87C','Selasa','8','21','22','22'),('JFSHV5Y9CB','Selasa','1','22','11','48'),('JFSHV691D2','Selasa','2','22','18','63'),('JFSHV6L238','Selasa','3','22','18','63'),('JFSHV6WA6B','Selasa','4','22','5','48'),('JFSHV76A6A','Selasa','5','22','5','48'),('JFSHV7H681','Selasa','6','22','16','60'),('JFSHV7R9E4','Selasa','7','22','16','60'),('JFSHV826B0','Selasa','8','22','16','60'),('JFSHV8D346','Selasa','1','23','24','31'),('JFSHV8O3ED','Selasa','2','23','24','31'),('JFSHV8YD66','Selasa','1','24','24','31'),('JFSHV99236','Selasa','2','24','24','31'),('JFSHV9KDCA','Selasa','3','23','21','10'),('JFSHV9U357','Selasa','4','23','21','10'),('JFSHVA559E','Selasa','5','23','26','42'),('JFSHVAH638','Selasa','6','23','26','42'),('JFSHVAS0DA','Selasa','7','23','12','59'),('JFSHVB3686','Selasa','8','23','12','59'),('JFSHVBE4ED','Selasa','3','24','22','22'),('JFSHVBPFC8','Selasa','4','24','22','22'),('JFSHVC1D54','Selasa','5','24','28','56'),('JFSHVCCF17','Selasa','6','24','11','48'),('JFSHVCL594','Selasa','7','24','23','47'),('JFSHVCV767','Selasa','8','24','23','47'),('JFSHVD5CF5','Selasa','1','25','5','26'),('JFSHVDGDD4','Selasa','2','25','5','26'),('JFSHVDR9E5','Selasa','3','25','2','38'),('JFSHVE0735','Selasa','4','25','18','63'),('JFSHVE9898','Selasa','5','25','18','63'),('JFSHVEJ83B','Selasa','6','25','10','35'),('JFSHVETC49','Selasa','7','25','10','35'),('JFSHVF2CA3','Selasa','8','25','10','35'),('JFSHVFB44B','Selasa','1','26','33','40'),('JFSHVFMD1F','Selasa','2','26','33','40'),('JFSHVFWE55','Selasa','3','26','24','62'),('JFSHVG670B','Selasa','4','26','24','62'),('JFSHVGF572','Selasa','5','26','38','58'),('JFSHVGQ817','Selasa','6','26','38','58'),('JFSHVH0A5D','Selasa','7','26','35','12'),('JFSHVHAF5B','Selasa','8','26','35','12'),('JFSHVHI3DA','Selasa','1','27','7','69'),('JFSHVHS8DF','Selasa','2','27','7','64'),('JFSHVI0F91','Selasa','3','27','27','53'),('JFSHVI96AE','Selasa','4','27','27','53'),('JFSHVIK3C2','Selasa','5','27','22','14'),('JFSHVIUBF6','Selasa','6','27','22','14'),('JFSHVJ3FBC','Selasa','7','27','17','18'),('JFSHVJDBA9','Selasa','8','27','17','18'),('JFSHVJM51A','Selasa','1','28','22','14'),('JFSHVJWA4F','Selasa','2','28','22','14'),('JFSHVK6F1A','Selasa','3','28','26','28'),('JFSHVKGA0C','Selasa','4','28','26','28'),('JFSHVKP663','Selasa','5','28','27','53'),('JFSHVKZ4B7','Selasa','6','28','27','53'),('JFSHVL97B2','Selasa','7','28','7','69'),('JFSHVLJ115','Selasa','8','28','7','69'),('JFSHVLT058','Selasa','1','29','3','16'),('JFSHVM2C44','Selasa','2','29','3','16'),('JFSHVMCD86','Selasa','3','29','24','62'),('JFSHVMM08B','Selasa','4','29','24','62'),('JFSHVMW948','Selasa','5','29','23','38'),('JFSHVN7D3A','Selasa','6','29','23','38'),('JFSHVNH1B7','Selasa','7','29','27','53'),('JFSHVNT727','Selasa','8','29','27','53'),('JFSVL4ZE88','Rabu','1','2','25','61'),('JFSVL6I374','Rabu','2','2','25','61'),('JFSVL6V5B1','Rabu','3','2','13','58'),('JFSVL7A1C3','Rabu','4','2','13','58'),('JFSVL7M035','Rabu','5','2','2','47'),('JFSVL82DC4','Rabu','6','2','2','47'),('JFSVL8I609','Rabu','7','2','23','25'),('JFSVL90EC8','Rabu','8','2','23','25'),('JFSVL9H0BE','Rabu','1','3','7','38'),('JFSVL9WC0A','Rabu','2','3','7','38'),('JFSVLAC6F4','Rabu','3','3','25','61'),('JFSVLAYFFA','Rabu','4','3','25','61'),('JFSVLBB5EA','Rabu','5','3','26','29'),('JFSVLBTBA1','Rabu','6','3','23','25'),('JFSVLCAA41','Rabu','7','3','6','43'),('JFSVLCS25D','Rabu','8','3','6','43'),('JFSVLD9170','Rabu','1','4','22','22'),('JFSVLDRAC6','Rabu','2','4','22','22'),('JFSVLE8549','Rabu','3','4','15','14'),('JFSVLEJ8FC','Rabu','4','4','15','14'),('JFSVLETA3D','Rabu','5','4','6','43'),('JFSVLF23B4','Rabu','6','4','6','43'),('JFSVLFCA8E','Rabu','7','4','21','54'),('JFSVLFM2DB','Rabu','8','4','21','54'),('JFSVLFXB86','Rabu','1','5','32','16'),('JFSVLG7CF8','Rabu','2','5','32','16'),('JFSVLGIC5C','Rabu','3','5','26','43'),('JFSVLGTA2C','Rabu','4','5','26','43'),('JFSVLH3B86','Rabu','5','5','15','14'),('JFSVLHD4CF','Rabu','6','5','15','14'),('JFSVLHO7C8','Rabu','7','5','9','52'),('JFSVLHZE5E','Rabu','8','5','9','52'),('JFSVLI94B0','Rabu','1','6','16','55'),('JFSVLIK9FF','Rabu','2','6','16','55'),('JFSVLIV490','Rabu','3','6','26','20'),('JFSVLJ58E5','Rabu','4','6','9','71'),('JFSVLJIC2E','Rabu','5','6','15','22'),('JFSVLJZ899','Rabu','6','6','15','22'),('JFSVLKDD1F','Rabu','7','6','23','55'),('JFSVLKR047','Rabu','8','6','23','55'),('JFSVLL36A6','Rabu','1','7','20','17'),('JFSVLLDD06','Rabu','2','7','20','17'),('JFSVLLO91B','Rabu','3','7','25','46'),('JFSVLLYB57','Rabu','4','7','25','46'),('JFSVLM9CD4','Rabu','5','7','16','55'),('JFSVLMJ041','Rabu','6','7','16','55'),('JFSVLMT027','Rabu','7','7','9','71'),('JFSVLN43CD','Rabu','8','7','9','71'),('JFSVLNG6E0','Rabu','1','8','32','18'),('JFSVLNPD5B','Rabu','2','8','32','18'),('JFSVLO00E7','Rabu','3','8','31','28'),('JFSVLO79C5','Rabu','4','8','31','28'),('JFSVLOF2FD','Rabu','5','8','25','46'),('JFSVLOP5D7','Rabu','6','8','25','46'),('JFSVLOY3E8','Rabu','7','8','26','20'),('JFSVLP5509','Rabu','8','8','26','20'),('JFTKS1U2DC','Rabu','1','9','25','30'),('JFTKS2M15C','Rabu','2','9','15','30'),('JFTKS38BA8','Rabu','3','9','15','30'),('JFTKS3XA12','Rabu','4','9','7','69'),('JFTKS4G9A8','Rabu','5','9','7','69'),('JFTKS4VBA0','Rabu','7','9','22','13'),('JFTKS59B6F','Rabu','8','9','22','13'),('JFTKS5O770','Rabu','6','9','32','18'),('JFTKS65F95','Rabu','2','10','24','31'),('JFTKS6MD74','Rabu','1','10','24','31'),('JFTKS7225B','Rabu','3','10','8','72'),('JFTKS7K780','Rabu','4','10','1','72'),('JFTKS8303E','Rabu','5','10','7','4'),('JFTKS8K364','Rabu','6','10','7','4'),('JFTKS939DF','Rabu','7','10','34','49'),('JFTKS9IC1A','Rabu','8','10','4','33'),('JFTKS9UF47','Rabu','1','11','11','48'),('JFTKSA40BC','Rabu','2','11','11','48'),('JFTKSAE212','Rabu','3','11','26','29'),('JFTKSAP44A','Rabu','4','11','26','29'),('JFTKSB04D4','Rabu','5','11','7','5'),('JFTKSBAFF0','Rabu','6','11','7','5'),('JFTKSBL4A8','Rabu','7','11','13','58'),('JFTKSBWB5A','Rabu','8','11','13','58'),('JFTKSC7FC4','Rabu','1','20','31','28'),('JFTKSCPE1A','Rabu','2','20','31','28'),('JFTKSD751E','Rabu','3','20','26','13'),('JFTKSDKB30','Rabu','4','20','26','13'),('JFTKSDUFD9','Rabu','5','20','30','18'),('JFTKSE5ECF','Rabu','6','20','15','30'),('JFTKSEF377','Rabu','7','20','4','33'),('JFTKSERBC6','Rabu','8','20','27','53'),('JFTKSF1B40','Rabu','1','12','18','4'),('JFTKSFBD0E','Rabu','2','12','18','4'),('JFTKSFN46C','Rabu','3','12','11','48'),('JFTKSFX9F2','Rabu','4','12','11','48'),('JFTKSG956F','Rabu','5','12','2','38'),('JFTKSGJ7E3','Rabu','6','12','2','38'),('JFTKSGT216','Rabu','7','12','21','10'),('JFTKSH447E','Rabu','8','12','21','10'),('JFTKSHE4D9','Rabu','1','13','13','58'),('JFTKSHOAAB','Rabu','2','13','13','58'),('JFTKSHXD59','Rabu','3','13','21','10'),('JFTKSI7D27','Rabu','4','13','21','10'),('JFTKSIHD1E','Rabu','5','13','11','48'),('JFTKSIQ6BF','Rabu','6','13','11','48'),('JFTKSJ1E45','Rabu','7','13','28','56'),('JFTKSJBD5B','Rabu','8','13','28','56'),('JFULOZD7D7','Rabu','1','14','22','14'),('JFULOZMBCD','Rabu','2','14','22','14'),('JFULOZW85C','Rabu','3','14','2','38'),('JFULP057FA','Rabu','4','14','2','38'),('JFULP0G1C7','Rabu','5','14','15','19'),('JFULP0RBE8','Rabu','6','14','26','29'),('JFULP13C36','Rabu','7','14','26','29'),('JFULP1EFCD','Rabu','8','14','4','14'),('JFULP1QE84','Rabu','1','15','21','51'),('JFULP21E8A','Rabu','2','15','21','51'),('JFULP2B102','Rabu','3','15','24','62'),('JFULP2O547','Rabu','4','15','24','62'),('JFULP33C55','Rabu','3','16','24','62'),('JFULP3HA15','Rabu','4','16','24','62'),('JFULP3W387','Rabu','5','16','26','13'),('JFULP4I165','Rabu','6','16','26','13'),('JFULP4WBD4','Rabu','5','15','20','17'),('JFULP5A0D1','Rabu','6','15','9','53'),('JFULP5M632','Rabu','7','15','9','53'),('JFULP5Y309','Rabu','8','15','23','29'),('JFULP69C6C','Rabu','7','16','37','19'),('JFULP6JD13','Rabu','8','16','37','19'),('JFULP6T108','Rabu','1','17','15','33'),('JFULP73128','Rabu','2','17','15','33'),('JFULP7D5B9','Rabu','3','17','16','55'),('JFULP7O2F7','Rabu','4','17','16','55'),('JFULP7Y91E','Rabu','5','17','29','26'),('JFULP8900D','Rabu','6','17','29','26'),('JFULP8J1FD','Rabu','7','17','21','51'),('JFULP8TD56','Rabu','8','17','21','51'),('JFULP9283C','Rabu','1','18','7','69'),('JFULP9CBD2','Rabu','2','18','7','69'),('JFULP9MFD1','Rabu','3','18','30','16'),('JFULP9U7D4','Rabu','4','18','27','53'),('JFULPA36A9','Rabu','5','18','31','28'),('JFULPAE088','Rabu','6','18','31','28'),('JFULPAO9E4','Rabu','7','18','17','18'),('JFULPAY8E5','Rabu','8','18','17','18'),('JFULPB8FB9','Rabu','1','19','9','52'),('JFULPBI564','Rabu','2','19','9','52'),('JFULPBRDD7','Rabu','7','19','15','30'),('JFULPC1753','Rabu','8','19','32','51'),('JFULPCB3DD','Rabu','1','21','24','62'),('JFULPCLA00','Rabu','2','21','24','62'),('JFULPCV2CA','Rabu','3','21','7','5'),('JFULPD5A53','Rabu','4','21','7','5'),('JFULPDG972','Rabu','5','21','16','60'),('JFULPDQ925','Rabu','6','21','16','60'),('JFULPE021E','Rabu','7','21','33','40'),('JFULPEBC3F','Rabu','8','21','33','40'),('JFULPEL19A','Rabu','1','22','14','62'),('JFULPEV830','Rabu','2','22','14','62'),('JFULPF647C','Rabu','3','22','26','4'),('JFULPFI560','Rabu','4','22','26','4'),('JFULPFTAE3','Rabu','5','22','9','52'),('JFULPG5C32','Rabu','6','22','9','52'),('JFULPGH381','Rabu','7','22','23','47'),('JFULPGT789','Rabu','8','22','23','47'),('JFULPH41BB','Rabu','1','23','7','5'),('JFULPHFBB1','Rabu','2','23','7','5'),('JFULPHQ950','Rabu','3','23','22','22'),('JFULPHZC20','Rabu','4','23','22','22'),('JFULPI8573','Rabu','5','23','6','54'),('JFULPIWA39','Rabu','6','23','4','40'),('JFULPK7DB0','Rabu','7','23','32','16'),('JFULPLAA78','Rabu','8','23','32','16'),('JFULPMB7A4','Rabu','1','24','28','56'),('JFULPNED11','Rabu','2','24','28','56'),('JFULPOHBCC','Rabu','3','24','4','40'),('JFULPVU7FC','Rabu','4','24','3','16'),('JFULQ0C37E','Rabu','5','24','32','16'),('JFULQ3070F','Rabu','6','24','32','16'),('JFULQ5WE57','Rabu','7','24','15','22'),('JFULQ6Y223','Rabu','8','24','15','22'),('JFULQ8I6B1','Rabu','1','25','14','43'),('JFULQB0DEF','Rabu','2','25','14','43'),('JFULQE5214','Rabu','3','25','24','31'),('JFULQHL4D9','Rabu','4','25','24','31'),('JFULQIQC88','Rabu','5','25','9','71'),('JFULQL98BB','Rabu','6','25','9','71'),('JFULQNW852','Rabu','7','25','20','17'),('JFULQOZ4C0','Rabu','8','25','20','17'),('JFULQQIE26','Rabu','1','26','5','26'),('JFULQUR042','Rabu','2','26','5','26'),('JFULQXQ577','Rabu','3','26','20','17'),('JFULR0QB94','Rabu','4','26','20','17'),('JFULR1UC9C','Rabu','5','26','26','37'),('JFULR3B0FC','Rabu','6','26','26','37'),('JFULR6BC95','Rabu','7','26','1','72'),('JFULR6ODFF','Rabu','8','26','1','72'),('JFULR763F9','Rabu','1','27','23','25'),('JFULR7H633','Rabu','2','27','23','25'),('JFULR7SEB1','Rabu','3','27','24','31'),('JFULR83E93','Rabu','4','27','24','31'),('JFULR8EA84','Rabu','5','27','21','51'),('JFULR8P434','Rabu','6','27','21','51'),('JFULR9005C','Rabu','7','27','12','59'),('JFULR9D66A','Rabu','8','27','12','59'),('JFULR9N70B','Rabu','1','28','1','72'),('JFULR9YBC4','Rabu','2','28','1','72'),('JFULRA88C1','Rabu','3','28','24','31'),('JFULRAJ242','Rabu','4','28','24','31'),('JFULRAUF07','Rabu','6','28','6','17'),('JFULRB4BFC','Rabu','7','28','5','26'),('JFULRBF33F','Rabu','8','28','5','26'),('JFULRBQ961','Rabu','1','29','27','53'),('JFULRC00C2','Rabu','2','29','27','53'),('JFULRCBEF5','Rabu','3','29','26','37'),('JFULRCLDE2','Rabu','4','29','26','37'),('JFULRCW300','Rabu','5','29','28','56'),('JFULRD719A','Rabu','6','29','28','56'),('JFULRDH415','Rabu','7','29','7','69'),('JFULRDS26D','Rabu','8','29','7','69'),('JFUYP3ACB3','Kamis','1','2','21','10'),('JFUYP4T158','Kamis','2','2','7','37'),('JFUYP6163C','Kamis','3','2','7','38'),('JFUYP6JFE7','Kamis','4','2','29','34'),('JFUYP7EEF6','Kamis','5','2','29','34'),('JFUYP81B2E','Kamis','1','3','23','25'),('JFUYP8T9A3','Kamis','2','3','24','25'),('JFUYP9E183','Kamis','3','3','10','67'),('JFUYPA387E','Kamis','4','3','10','67'),('JFUYPAL6B3','Kamis','5','3','7','38'),('JFUYPB5F68','Kamis','1','4','2','47'),('JFUYPBPB2A','Kamis','2','4','2','47'),('JFUYPC740A','Kamis','3','4','34','34'),('JFUYPCRC13','Kamis','4','4','17','72'),('JFUYPD2467','Kamis','5','4','17','72'),('JFUYPDD29E','Kamis','1','5','21','54'),('JFUYPDNDC0','Kamis','2','5','21','54'),('JFUYPDXDB6','Kamis','3','5','29','34'),('JFUYPE8EA7','Kamis','4','5','2','47'),('JFUYPEJ306','Kamis','5','5','2','47'),('JFUYPEW55E','Kamis','1','6','6','17'),('JFUYPF60DE','Kamis','2','6','6','17'),('JFUYPFG7F3','Kamis','3','6','21','66'),('JFUYPFQ927','Kamis','4','6','7','69'),('JFUYPG0AB7','Kamis','5','6','7','69'),('JFUYPGA8DD','Kamis','1','7','29','26'),('JFUYPGK016','Kamis','2','7','29','26'),('JFUYPGU631','Kamis','3','7','26','20'),('JFUYPH59C2','Kamis','4','7','21','66'),('JFUYPHFC5B','Kamis','5','7','21','66'),('JFVKB410F2','Kamis','1','8','21','55'),('JFVKB53275','Kamis','2','8','21','55'),('JFVKB6E785','Kamis','3','8','9','70'),('JFVKB7801F','Kamis','4','8','29','26'),('JFVKB822CB','Kamis','5','8','29','26'),('JFVKB8WC2E','Kamis','1','9','23','66'),('JFVKB9E1C6','Kamis','2','9','23','66'),('JFVKBA5CF1','Kamis','3','9','1','72'),('JFVKBAN108','Kamis','4','9','17','18'),('JFVKBB4EB8','Kamis','5','9','17','18'),('JFVKBBL182','Kamis','1','10','13','58'),('JFVKBCC6BF','Kamis','2','10','13','58'),('JFVKBCQ603','Kamis','3','10','32','18'),('JFVKBD2318','Kamis','4','10','2','4'),('JFVKBDC1E0','Kamis','5','10','2','4'),('JFVKBDOF47','Kamis','1','11','23','29'),('JFVKBE0929','Kamis','2','11','1','11'),('JFVKBE8F81','Kamis','3','11','1','11'),('JFVKBEH051','Kamis','4','11','35','12'),('JFVKBEQADC','Kamis','5','11','35','12'),('JFVKBEZ34B','Kamis','1','20','2','4'),('JFVKBF8F88','Kamis','2','20','2','4'),('JFVKBFH462','Kamis','3','20','13','58'),('JFVKBFRAC3','Kamis','4','20','13','58'),('JFVKBG0656','Kamis','5','20','32','55'),('JFVKBG9712','Kamis','1','12','10','67'),('JFVKBGJ9D9','Kamis','2','12','10','67'),('JFVKBGS8A4','Kamis','3','12','18','4'),('JFVKBH2E5B','Kamis','4','12','23','29'),('JFVKBHCD10','Kamis','5','12','10','67'),('JFVKBHL016','Kamis','1','13','12','59'),('JFVKBHVB4A','Kamis','2','13','12','59'),('JFVKBI5E13','Kamis','3','13','15','33'),('JFVKBIF9C0','Kamis','4','13','8','11'),('JFVKBIQ1BD','Kamis','5','13','8','11'),('JFVKBIZC1D','Kamis','1','14','23','72'),('JFVKBJ8EF5','Kamis','2','14','28','56'),('JFVKBJH328','Kamis','3','14','28','56'),('JFVKBJQ6B8','Kamis','4','14','6','75'),('JFVKBK6A72','Kamis','5','14','6','75'),('JFVKBKF84E','Kamis','1','15','33','40'),('JFVKBKO704','Kamis','2','15','33','40'),('JFVKBKY132','Kamis','3','15','10','74'),('JFVKBL707D','Kamis','1','16','1','74'),('JFVKBLHC90','Kamis','2','16','1','74'),('JFVKBLQ1A1','Kamis','3','16','10','35'),('JFVKBLYEB8','Kamis','4','16','15','33'),('JFVKBM7715','Kamis','5','16','15','33'),('JFVKBMGA60','Kamis','3','17','23','29'),('JFVKBMQ0C4','Kamis','4','17','36','40'),('JFVKBMZE33','Kamis','5','17','36','40'),('JFVKBN9079','Kamis','1','18','9','52'),('JFVKBNJDF3','Kamis','2','18','9','52'),('JFVKBNT36E','Kamis','3','18','13','57'),('JFVKBO4BC3','Kamis','4','18','13','57'),('JFVKBOD1F7','Kamis','5','18','23','29'),('JFWEDH2400','Kamis','1','19','30','18'),('JFWEDI28B1','Kamis','2','19','22','22'),('JFWEDIE410','Kamis','3','19','22','22'),('JFWEDIQCB3','Kamis','4','19','26','20'),('JFWEDJ4A67','Kamis','5','19','26','20'),('JFWEDJE3D1','Kamis','1','21','14','57'),('JFWEDJND89','Kamis','2','21','14','57'),('JFWEDJX5E8','Kamis','3','21','6','54'),('JFWEDK7141','Kamis','4','21','2','38'),('JFWEDKH52B','Kamis','5','21','20','54'),('JFWEDKR214','Kamis','6','21','20','54'),('JFWEDL24AE','Kamis','7','21','29','75'),('JFWEDLCE6F','Kamis','8','21','29','75'),('JFWEDLM68A','Kamis','1','22','2','38'),('JFWEDLX4D8','Kamis','2','22','21','10'),('JFWEDM77EA','Kamis','3','22','21','10'),('JFWEDMH859','Kamis','4','22','22','22'),('JFWEDMU14E','Kamis','5','22','22','22'),('JFWEDN4D1F','Kamis','6','22','4','33'),('JFWEDNF938','Kamis','7','22','14','33'),('JFWEDNQ043','Kamis','8','22','14','33'),('JFWEDO037C','Kamis','1','23','29','75'),('JFWEDOB829','Kamis','2','23','29','75'),('JFWEDOUC6C','Kamis','3','23','12','59'),('JFWEDP801D','Kamis','4','23','12','59'),('JFWEDPJ8E3','Kamis','5','23','1','56'),('JFWEDPT5CE','Kamis','6','23','2','38'),('JFWEDQ4BB4','Kamis','7','23','17','67'),('JFWEDQFE2A','Kamis','8','23','17','67'),('JFWEDQP516','Kamis','1','24','14','33'),('JFWEDQZ8AE','Kamis','2','24','14','33'),('JFWEDRA5FD','Kamis','3','24','9','52'),('JFWEDRLC27','Kamis','4','24','9','52'),('JFWEDRVECD','Kamis','5','24','21','10'),('JFWEDS7082','Kamis','6','24','21','10'),('JFWEDSFBE0','Kamis','7','24','29','29'),('JFWEDSOE8B','Kamis','8','24','29','29'),('JFWEDSVC1E','Kamis','1','25','10','35'),('JFWEDT3998','Kamis','2','25','10','35'),('JFWEDTB8AD','Kamis','3','25','6','17'),('JFWEDTKCA3','Kamis','4','25','21','51'),('JFWEDTS3E3','Kamis','5','25','21','51'),('JFWEDU21FC','Kamis','6','25','7','69'),('JFWEDUB6C8','Kamis','7','25','7','69'),('JFWEDUL382','Kamis','1','26','7','69'),('JFWEDUV9FE','Kamis','2','26','7','69'),('JFWEDV572D','Kamis','3','26','16','55'),('JFWEDVF7C9','Kamis','4','26','16','55'),('JFWEDVP2B4','Kamis','5','26','9','71'),('JFWEDVY060','Kamis','6','26','9','71'),('JFWEDWA35C','Kamis','7','26','29','26'),('JFWEDWN609','Kamis','8','26','29','26'),('JFWEDWYFE3','Kamis','1','27','32','65'),('JFWEDX7176','Kamis','2','27','32','65'),('JFWEDXJ008','Kamis','3','27','38','27'),('JFWEDXU5E1','Kamis','4','27','38','27'),('JFWEDY538A','Kamis','5','27','1','74'),('JFWEDYG651','Kamis','7','27','15','57'),('JFWEDYSF9B','Kamis','8','27','15','57'),('JFWEDZ4896','Kamis','1','28','38','27'),('JFWEDZF120','Kamis','2','28','38','27'),('JFWEDZQ2E1','Kamis','3','28','23','25'),('JFWEE009A6','Kamis','4','28','23','25'),('JFWEE0A482','Kamis','5','28','32','65'),('JFWEE0J3A7','Kamis','6','28','32','65'),('JFWEE0UF1E','Kamis','7','28','17','18'),('JFWEE13B0E','Kamis','8','28','17','18'),('JFWEE1DC03','Kamis','1','29','28','56'),('JFWEE1N16C','Kamis','2','29','21','51'),('JFWEE1XEDD','Kamis','3','29','21','51'),('JFWEE271CD','Kamis','4','29','6','17'),('JFWEE2H42F','Kamis','6','29','15','57'),('JFWEE2QC9C','Kamis','5','29','15','57'),('JFWEE3691D','Kamis','7','29','22','22'),('JFWEE3G36E','Kamis','8','29','22','22'),('JGL1BQIEC1','Sabtu','2','2','7','38'),('JGL1BQZ4E0','Sabtu','3','2','15','73'),('JGL1BRFF8F','Sabtu','4','2','15','73'),('JGL1BRQ5BE','Sabtu','5','2','20','54'),('JGL1BS0BB2','Sabtu','6','2','20','54'),('JGL1BS866C','Sabtu','7','2','1','11'),('JGL1BSLDB4','Sabtu','8','2','1','11'),('JGL1BSU5DA','Sabtu','2','3','8','11'),('JGL1BT3D33','Sabtu','3','3','1','11'),('JGL1BTFFB2','Sabtu','4','3','21','10'),('JGL1BTOFC8','Sabtu','5','3','22','22'),('JGL1BU0995','Sabtu','6','3','22','22'),('JGL1BUDB28','Sabtu','7','3','29','34'),('JGL1BUMCB0','Sabtu','8','3','29','34'),('JGL1BUUA7C','Sabtu','2','4','17','72'),('JGL1BV2ED7','Sabtu','3','4','12','16'),('JGL1BVA4F7','Sabtu','4','4','29','34'),('JGL1BVH7BF','Sabtu','5','4','32','16'),('JGL1BVP7FF','Sabtu','6','4','4','33'),('JGL1BVW72B','Sabtu','7','4','12','16'),('JGL1BW3B4A','Sabtu','8','4','12','16'),('JGL1BWBA19','Sabtu','2','5','28','34'),('JGL1BWJ536','Sabtu','3','5','28','34'),('JGL1BWS2EF','Sabtu','4','5','32','16'),('JGL1BX0A21','Sabtu','5','5','7','73'),('JGL1BX9107','Sabtu','6','5','7','73'),('JGL1BXHE4E','Sabtu','7','5','22','22'),('JGL1BXPC54','Sabtu','8','5','22','22'),('JGLLR0FDE1','Sabtu','2','6','4','73'),('JGLLR0Q723','Sabtu','3','6','29','26'),('JGLLR134EF','Sabtu','4','6','29','26'),('JGLLR20E0F','Sabtu','5','6','25','30'),('JGLLR2G890','Sabtu','6','6','25','30'),('JGLLR2U5DE','Sabtu','7','6','26','20'),('JGLLR3A39C','Sabtu','8','6','26','20'),('JGLLR3PF45','Sabtu','2','7','31','28'),('JGLLR44B49','Sabtu','3','7','31','28'),('JGLLR4WE19','Sabtu','4','7','9','71'),('JGLLR58137','Sabtu','5','7','23','55'),('JGLLR5L158','Sabtu','6','7','23','55'),('JGLLR5Y9DD','Sabtu','7','7','8','72'),('JGLLR6A797','Sabtu','8','7','1','72'),('JGLLR6YF3E','Sabtu','2','8','2','4'),('JGLLR7BFDD','Sabtu','3','8','2','4'),('JGLLR7N5F8','Sabtu','4','8','17','18'),('JGLLR7XDEB','Sabtu','5','8','7','69'),('JGLLR86E5D','Sabtu','6','8','7','69'),('JGLLR8G54C','Sabtu','7','8','15','33'),('JGLLR8Q98A','Sabtu','8','8','15','33'),('JO1KT3E641','Selasa','1','2','26','29'),('JO1KT4B076','Selasa','2','2','26','29'),('JO1KT4P9A0','Selasa','1','3','13','58'),('JO1KT5240F','Selasa','2','3','13','58'),('JO1KT5H658','Selasa','1','4','26','36'),('JO1KT5XC86','Selasa','2','4','26','36'),('JO1KT6B18D','Selasa','1','5','12','59'),('JO1KT6Q326','Selasa','2','5','12','59'),('JO1KT73637','Selasa','1','6','2','4'),('JO1KT7HDE6','Selasa','2','6','2','4'),('JO1KT7V230','Selasa','1','7','10','74'),('JO1KT88FDB','Selasa','2','7','10','74'),('JO1KT8K627','Selasa','1','9','32','18'),('JO1KT8W760','Selasa','2','9','32','18'),('JO1KT983F0','Selasa','1','10','31','28'),('JO1KT9L1C9','Selasa','2','10','31','28');
/*!40000 ALTER TABLE `jadwal` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `kategori_pengeluaran`
--

DROP TABLE IF EXISTS `kategori_pengeluaran`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kategori_pengeluaran` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nama` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `kategori_pengeluaran`
--

LOCK TABLES `kategori_pengeluaran` WRITE;
/*!40000 ALTER TABLE `kategori_pengeluaran` DISABLE KEYS */;
/*!40000 ALTER TABLE `kategori_pengeluaran` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `kegiatan`
--

DROP TABLE IF EXISTS `kegiatan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kegiatan` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tanggal` date NOT NULL,
  `nama` varchar(150) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_kegiatan_tanggal` (`tanggal`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `kegiatan`
--

LOCK TABLES `kegiatan` WRITE;
/*!40000 ALTER TABLE `kegiatan` DISABLE KEYS */;
INSERT INTO `kegiatan` VALUES (1,'2026-02-06','Rapat','2026-02-06 03:17:57'),(2,'2026-02-06','rapat','2026-02-06 03:18:22');
/*!40000 ALTER TABLE `kegiatan` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `kegiatan_guru`
--

DROP TABLE IF EXISTS `kegiatan_guru`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kegiatan_guru` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kegiatan_id` int NOT NULL,
  `guru_id` varchar(10) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_kegiatan_guru` (`kegiatan_id`,`guru_id`),
  KEY `idx_kegiatan_guru` (`guru_id`),
  CONSTRAINT `fk_kegiatan_guru` FOREIGN KEY (`kegiatan_id`) REFERENCES `kegiatan` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `kegiatan_guru`
--

LOCK TABLES `kegiatan_guru` WRITE;
/*!40000 ALTER TABLE `kegiatan_guru` DISABLE KEYS */;
INSERT INTO `kegiatan_guru` VALUES (3,1,'10'),(1,1,'4'),(2,1,'5'),(4,2,'25');
/*!40000 ALTER TABLE `kegiatan_guru` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `kehadiran`
--

DROP TABLE IF EXISTS `kehadiran`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kehadiran` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tanggal` datetime NOT NULL,
  `jam_ke` varchar(50) NOT NULL,
  `kelas` varchar(20) NOT NULL,
  `guru_id` varchar(10) DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `jumlah_jam` int NOT NULL DEFAULT '0',
  `tanggal_only` date NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_kehadiran` (`guru_id`,`kelas`,`jam_ke`,`tanggal_only`),
  KEY `idx_kehadiran_date` (`tanggal_only`),
  KEY `idx_kehadiran_guru` (`guru_id`),
  CONSTRAINT `fk_kehadiran_guru` FOREIGN KEY (`guru_id`) REFERENCES `guru` (`guru_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `kehadiran`
--

LOCK TABLES `kehadiran` WRITE;
/*!40000 ALTER TABLE `kehadiran` DISABLE KEYS */;
/*!40000 ALTER TABLE `kehadiran` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `kelas`
--

DROP TABLE IF EXISTS `kelas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kelas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nama` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `kelas`
--

LOCK TABLES `kelas` WRITE;
/*!40000 ALTER TABLE `kelas` DISABLE KEYS */;
/*!40000 ALTER TABLE `kelas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `konfigurasi`
--

DROP TABLE IF EXISTS `konfigurasi`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `konfigurasi` (
  `config_key` varchar(50) NOT NULL,
  `config_value` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `konfigurasi`
--

LOCK TABLES `konfigurasi` WRITE;
/*!40000 ALTER TABLE `konfigurasi` DISABLE KEYS */;
INSERT INTO `konfigurasi` VALUES ('RATE_HADIR','3500'),('RATE_IZIN','0'),('RATE_MENGAJAR','0'),('RATE_TIDAK_HADIR','0'),('RATE_TRANSPORT','25000'),('RATE_TRANSPORT_INPASSING','0'),('RATE_TRANSPORT_NON_SERTIFIKASI',''),('RATE_TRANSPORT_PNS','0'),('RATE_TRANSPORT_SERTIFIKASI','12500'),('WIYATHA_1_5','50000'),('WIYATHA_11_15','150000'),('WIYATHA_16_20','200000'),('WIYATHA_21_25','250000'),('WIYATHA_26_PLUS','300000'),('WIYATHA_6_10','100000');
/*!40000 ALTER TABLE `konfigurasi` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `letters`
--

DROP TABLE IF EXISTS `letters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `letters` (
  `id` int NOT NULL AUTO_INCREMENT,
  `letter_number` varchar(100) DEFAULT '',
  `date` date NOT NULL,
  `type` enum('incoming','outgoing') NOT NULL,
  `subject` varchar(255) DEFAULT '',
  `sender_recipient` varchar(255) DEFAULT '',
  `priority` varchar(20) NOT NULL DEFAULT 'normal',
  `notes` text,
  `status` varchar(20) NOT NULL DEFAULT 'new',
  `file_url` varchar(255) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_letters_date` (`date`),
  KEY `idx_letters_type` (`type`),
  KEY `fk_letters_user` (`created_by`),
  CONSTRAINT `fk_letters_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `letters`
--

LOCK TABLES `letters` WRITE;
/*!40000 ALTER TABLE `letters` DISABLE KEYS */;
/*!40000 ALTER TABLE `letters` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `libur`
--

DROP TABLE IF EXISTS `libur`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `libur` (
  `tanggal` date NOT NULL,
  `keterangan` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tanggal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `libur`
--

LOCK TABLES `libur` WRITE;
/*!40000 ALTER TABLE `libur` DISABLE KEYS */;
/*!40000 ALTER TABLE `libur` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mapel`
--

DROP TABLE IF EXISTS `mapel`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mapel` (
  `mapel_id` varchar(10) NOT NULL,
  `nama` varchar(100) NOT NULL,
  PRIMARY KEY (`mapel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mapel`
--

LOCK TABLES `mapel` WRITE;
/*!40000 ALTER TABLE `mapel` DISABLE KEYS */;
/*!40000 ALTER TABLE `mapel` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pengeluaran_ekstrakurikuler`
--

DROP TABLE IF EXISTS `pengeluaran_ekstrakurikuler`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pengeluaran_ekstrakurikuler` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tanggal` date NOT NULL,
  `teacher_id` bigint NOT NULL,
  `teacher_name` varchar(120) NOT NULL,
  `nama_ekstra` varchar(120) NOT NULL,
  `jumlah_hadir` int NOT NULL DEFAULT '1',
  `nominal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `keterangan` text,
  `expense_id` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ekstra_tanggal` (`tanggal`),
  KEY `idx_ekstra_teacher` (`teacher_id`),
  KEY `idx_ekstra_expense` (`expense_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pengeluaran_ekstrakurikuler`
--

LOCK TABLES `pengeluaran_ekstrakurikuler` WRITE;
/*!40000 ALTER TABLE `pengeluaran_ekstrakurikuler` DISABLE KEYS */;
INSERT INTO `pengeluaran_ekstrakurikuler` VALUES (1,'2026-03-07',18,'Alfia Septiana, S.Pd','Tata Boga',1,50000.00,NULL,NULL,'2026-03-07 04:56:51','2026-03-07 08:37:01'),(2,'2026-04-01',18,'Alfia Septiana, S.Pd','Tata Boga',0,50000.00,NULL,NULL,'2026-03-07 08:18:05','2026-03-07 08:37:01'),(3,'2026-05-01',18,'Alfia Septiana, S.Pd','Tata Boga',0,50000.00,NULL,NULL,'2026-03-07 08:18:16','2026-03-07 08:37:01');
/*!40000 ALTER TABLE `pengeluaran_ekstrakurikuler` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pengeluaran_kedisiplinan`
--

DROP TABLE IF EXISTS `pengeluaran_kedisiplinan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pengeluaran_kedisiplinan` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tanggal` date NOT NULL,
  `teacher_id` bigint NOT NULL,
  `teacher_name` varchar(120) NOT NULL,
  `jumlah_hadir` int NOT NULL DEFAULT '0',
  `nominal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `keterangan` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_disiplin_tanggal` (`tanggal`),
  KEY `idx_disiplin_teacher` (`teacher_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pengeluaran_kedisiplinan`
--

LOCK TABLES `pengeluaran_kedisiplinan` WRITE;
/*!40000 ALTER TABLE `pengeluaran_kedisiplinan` DISABLE KEYS */;
/*!40000 ALTER TABLE `pengeluaran_kedisiplinan` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pengeluaran_lain`
--

DROP TABLE IF EXISTS `pengeluaran_lain`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pengeluaran_lain` (
  `id` varchar(10) NOT NULL,
  `tanggal` date NOT NULL,
  `kategori` varchar(50) NOT NULL,
  `penerima` varchar(100) NOT NULL,
  `jumlah` int NOT NULL DEFAULT '1',
  `nominal` decimal(12,2) NOT NULL DEFAULT '0.00',
  `keterangan` text,
  PRIMARY KEY (`id`),
  KEY `idx_pengeluaran_tanggal` (`tanggal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pengeluaran_lain`
--

LOCK TABLES `pengeluaran_lain` WRITE;
/*!40000 ALTER TABLE `pengeluaran_lain` DISABLE KEYS */;
INSERT INTO `pengeluaran_lain` VALUES ('P001','2026-02-01','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P002','2026-02-01','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P003','2026-02-01','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P004','2026-02-01','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P005','2026-02-01','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P006','2026-02-01','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P007','2026-02-01','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P008','2026-02-01','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P009','2026-02-01','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P010','2026-02-01','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P011','2026-02-01','kebersihan','',1,1000000.00,'Periode 2026-02'),('P023','2026-02-01','MAKAN','',1,1000000.00,'Periode 2026-02'),('P461','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P462','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P463','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P464','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P465','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P466','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P467','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P468','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P469','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P470','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P471','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P472','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P473','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P474','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P475','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P476','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P477','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P478','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P479','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P480','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P481','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P482','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P483','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02'),('P484','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P485','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P486','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P487','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P488','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P489','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P490','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P491','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P492','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P493','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P494','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P495','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P496','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P497','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P498','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P499','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P500','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P501','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P502','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P503','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P504','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P505','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P506','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02'),('P507','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P508','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P509','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P510','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P511','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P512','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P513','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P514','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P515','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P516','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P517','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P518','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P519','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P520','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P521','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P522','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P523','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P524','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P525','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P526','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P527','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P528','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P529','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02'),('P530','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P531','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P532','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P533','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P534','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P535','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P536','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P537','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P538','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P539','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P540','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P541','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P542','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P543','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P544','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P545','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P546','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P547','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P548','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P549','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P550','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P551','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P552','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02'),('P553','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P554','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P555','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P556','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P557','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P558','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P559','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P560','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P561','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P562','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P563','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P564','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P565','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P566','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P567','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P568','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P569','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P570','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P571','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P572','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P573','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P574','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P575','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02'),('P576','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P577','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P578','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P579','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P580','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P581','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P582','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P583','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P584','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P585','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P586','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P587','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P588','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P589','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P590','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P591','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P592','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P593','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P594','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P595','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P596','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P597','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P598','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02'),('P599','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P600','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P601','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P602','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P603','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P604','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P605','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P606','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P607','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P608','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P609','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P610','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P611','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P612','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P613','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P614','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P615','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P616','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P617','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P618','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P619','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P620','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P621','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02'),('P622','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P623','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P624','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P625','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P626','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P627','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P628','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P629','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P630','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P631','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P632','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P633','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P634','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P635','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P636','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P637','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P638','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P639','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P640','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P641','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P642','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P643','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P644','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02'),('P645','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P646','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P647','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P648','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P649','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P650','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P651','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P652','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P653','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P654','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P655','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P656','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P657','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P658','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P659','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P660','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P661','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P662','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P663','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P664','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P665','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P666','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P667','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02'),('P668','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P669','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P670','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P671','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P672','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P673','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P674','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P675','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P676','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P677','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P678','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P679','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P680','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P681','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P682','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P683','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P684','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P685','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P686','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P687','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P688','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P689','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P690','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02'),('P691','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P692','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P693','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P694','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P695','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P696','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P697','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P698','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P699','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P700','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P701','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P702','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P703','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P704','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P705','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P706','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P707','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P708','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P709','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P710','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P711','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P712','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P713','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02'),('P714','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P715','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P716','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P717','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P718','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P719','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P720','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P721','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P722','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P723','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P724','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P725','2026-02-02','Teh ( Neng Fid)','',25,3500.00,'Periode 2026-02'),('P726','2026-02-02','Kebersihan Kampus A','',1,1000000.00,'Periode 2026-02'),('P727','2026-02-02','Kebersihan Kampus B','',1,1000000.00,'Periode 2026-02'),('P728','2026-02-02','Juru Kunci','',1,1000000.00,'Periode 2026-02'),('P729','2026-02-02','Petugas Sampah','',1,1000000.00,'Periode 2026-02'),('P730','2026-02-02','Jajan Kampus A','',1,3500.00,'Periode 2026-02'),('P731','2026-02-02','Teh ( KH. Masluchan Sholih)','',25,3500.00,'Periode 2026-02'),('P732','2026-02-02','Mushola PP Annuroniyah dan TV','',1,1000000.00,'Periode 2026-02'),('P733','2026-02-02','Kamar Mandi','',1,1000000.00,'Periode 2026-02'),('P734','2026-02-02','Jajan Kampus B','',1,1000000.00,'Periode 2026-02'),('P735','2026-02-02','kebersihan','',1,1000000.00,'Periode 2026-02'),('P736','2026-02-02','MAKAN','',1,1000000.00,'Periode 2026-02');
/*!40000 ALTER TABLE `pengeluaran_lain` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `piket`
--

DROP TABLE IF EXISTS `piket`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `piket` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nama` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `piket`
--

LOCK TABLES `piket` WRITE;
/*!40000 ALTER TABLE `piket` DISABLE KEYS */;
/*!40000 ALTER TABLE `piket` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `salary_components`
--

DROP TABLE IF EXISTS `salary_components`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `salary_components` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `type` enum('earning','deduction') NOT NULL DEFAULT 'earning',
  `description` text,
  `is_taxable` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `salary_components`
--

LOCK TABLES `salary_components` WRITE;
/*!40000 ALTER TABLE `salary_components` DISABLE KEYS */;
/*!40000 ALTER TABLE `salary_components` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schedule_config`
--

DROP TABLE IF EXISTS `schedule_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `schedule_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `config_json` json NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedule_config`
--

LOCK TABLES `schedule_config` WRITE;
/*!40000 ALTER TABLE `schedule_config` DISABLE KEYS */;
INSERT INTO `schedule_config` VALUES (1,'default','{\"days\": [\"Senin\", \"Selasa\", \"Rabu\", \"Kamis\", \"Sabtu\", \"Ahad\"], \"hoursByDay\": {\"Ahad\": 8, \"Rabu\": 8, \"Kamis\": 8, \"Sabtu\": 8, \"Senin\": 8, \"Selasa\": 8}}','2026-02-06 01:16:17'),(2,'default','{\"days\": [\"Senin\", \"Selasa\", \"Rabu\", \"Kamis\", \"Sabtu\", \"Ahad\"], \"hoursByDay\": {\"Ahad\": 8, \"Rabu\": 8, \"Kamis\": 8, \"Sabtu\": 8, \"Senin\": 8, \"Selasa\": 8}}','2026-02-06 07:54:04');
/*!40000 ALTER TABLE `schedule_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `settings`
--

DROP TABLE IF EXISTS `settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `settings` (
  `config_key` varchar(100) NOT NULL,
  `config_value` text,
  `category` varchar(50) NOT NULL DEFAULT 'general',
  `description` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `settings`
--

LOCK TABLES `settings` WRITE;
/*!40000 ALTER TABLE `settings` DISABLE KEYS */;
INSERT INTO `settings` VALUES ('RATE_HADIR','0','payroll',NULL,'2026-02-15 02:48:27'),('RATE_IZIN','0','payroll',NULL,'2026-02-15 02:48:27'),('RATE_MENGAJAR','0','payroll',NULL,'2026-02-15 02:48:27'),('RATE_TIDAK_HADIR','0','payroll',NULL,'2026-02-15 02:48:27'),('RATE_TRANSPORT','0','payroll',NULL,'2026-02-15 02:48:27'),('RATE_TRANSPORT_INPASSING','0','payroll',NULL,'2026-02-15 02:48:27'),('RATE_TRANSPORT_NON_SERTIFIKASI','0','payroll',NULL,'2026-02-15 02:48:27'),('RATE_TRANSPORT_PNS','0','payroll',NULL,'2026-02-15 02:48:27'),('RATE_TRANSPORT_SERTIFIKASI','0','payroll',NULL,'2026-02-15 02:48:27'),('WIYATHA_1_5','0','payroll',NULL,'2026-02-15 02:48:27'),('WIYATHA_11_15','0','payroll',NULL,'2026-02-15 02:48:27'),('WIYATHA_16_20','0','payroll',NULL,'2026-02-15 02:48:27'),('WIYATHA_21_25','0','payroll',NULL,'2026-02-15 02:48:27'),('WIYATHA_26_PLUS','0','payroll',NULL,'2026-02-15 02:48:27'),('WIYATHA_6_10','0','payroll',NULL,'2026-02-15 02:48:27');
/*!40000 ALTER TABLE `settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subjects`
--

DROP TABLE IF EXISTS `subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `subjects` (
  `id` varchar(10) NOT NULL,
  `code` varchar(20) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `description` text,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subjects`
--

LOCK TABLES `subjects` WRITE;
/*!40000 ALTER TABLE `subjects` DISABLE KEYS */;
/*!40000 ALTER TABLE `subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_limits`
--

DROP TABLE IF EXISTS `teacher_limits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `teacher_limits` (
  `id` int NOT NULL AUTO_INCREMENT,
  `teacher_id` int NOT NULL,
  `max_hours_per_week` int DEFAULT NULL,
  `max_hours_per_day` int DEFAULT NULL,
  `min_hours_linier` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_teacher_limit` (`teacher_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_limits`
--

LOCK TABLES `teacher_limits` WRITE;
/*!40000 ALTER TABLE `teacher_limits` DISABLE KEYS */;
/*!40000 ALTER TABLE `teacher_limits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_subjects`
--

DROP TABLE IF EXISTS `teacher_subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `teacher_subjects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `teacher_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `priority` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_teacher_subject` (`teacher_id`,`subject_id`),
  KEY `idx_teacher_priority` (`teacher_id`,`priority`)
) ENGINE=InnoDB AUTO_INCREMENT=106 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_subjects`
--

LOCK TABLES `teacher_subjects` WRITE;
/*!40000 ALTER TABLE `teacher_subjects` DISABLE KEYS */;
INSERT INTO `teacher_subjects` VALUES (1,4,1,1),(2,4,2,1),(3,4,3,1),(4,4,4,1),(5,4,5,1),(6,4,6,1),(7,4,7,1),(8,4,8,1),(9,4,9,1),(10,4,10,1),(11,4,11,1),(12,4,12,1),(13,4,13,1),(14,4,14,1),(15,4,15,1),(16,4,16,1),(17,4,17,1),(18,4,18,1),(19,4,19,1),(20,4,20,1),(21,4,21,1),(22,4,22,1),(23,4,23,1),(24,4,24,1),(25,4,25,1),(26,4,26,1),(27,4,27,1),(28,4,28,1),(29,4,29,1),(30,4,30,1),(31,4,31,1),(32,4,32,1),(33,4,33,1),(34,4,34,1),(35,4,35,1),(36,4,36,1),(37,4,37,1),(38,4,38,1),(39,5,3,1),(40,10,13,1),(41,11,18,1),(42,12,9,1),(43,13,15,1),(44,14,8,1),(45,15,13,1),(46,16,15,1),(47,17,8,1),(48,18,38,1),(49,19,25,1),(50,20,3,1),(51,21,5,1),(52,22,8,1),(53,23,3,1),(54,23,4,1),(55,55,4,1),(56,55,21,1),(57,55,24,1),(58,57,19,1),(59,57,35,1),(60,57,36,1),(61,57,37,1),(62,58,3,1),(63,58,4,1),(64,58,8,1),(65,58,25,1),(66,59,3,1),(67,59,20,1),(68,59,21,1),(69,60,4,1),(70,60,21,1),(71,60,36,1),(72,61,3,1),(73,61,22,1),(74,61,24,1),(75,62,20,1),(76,62,21,1),(77,62,36,1),(78,63,3,1),(79,63,4,1),(80,63,6,1),(81,63,21,1),(82,63,37,1),(83,64,4,1),(84,66,4,1),(85,66,8,1),(86,66,22,1),(87,66,25,1),(88,67,7,1),(89,67,21,1),(90,67,22,1),(91,67,24,1),(92,68,3,1),(93,68,20,1),(94,68,21,1),(95,68,36,1),(96,68,37,1),(97,69,4,1),(98,69,22,1),(99,70,3,1),(100,70,19,1),(101,70,21,1),(102,70,36,1),(103,71,1,1),(104,71,21,1),(105,71,31,1);
/*!40000 ALTER TABLE `teacher_subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_task_rates`
--

DROP TABLE IF EXISTS `teacher_task_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `teacher_task_rates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `nominal` decimal(12,2) NOT NULL DEFAULT '0.00',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_task_rate` (`task_id`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_task_rates`
--

LOCK TABLES `teacher_task_rates` WRITE;
/*!40000 ALTER TABLE `teacher_task_rates` DISABLE KEYS */;
INSERT INTO `teacher_task_rates` VALUES (1,2,1680000.00,'2026-02-21 05:45:29'),(2,5,70000.00,'2026-02-06 08:24:26'),(3,4,280000.00,'2026-02-21 05:49:37'),(4,3,500000.00,'2026-02-21 05:49:46'),(6,13,560000.00,'2026-02-21 05:45:41'),(7,39,420000.00,'2026-02-21 05:46:22'),(8,22,420000.00,'2026-02-21 05:46:47'),(9,40,420000.00,'2026-02-21 05:47:20'),(10,23,560000.00,'2026-02-21 05:47:39'),(11,41,300000.00,'2026-02-21 05:48:06'),(12,42,300000.00,'2026-02-21 05:48:27'),(13,36,200000.00,'2026-02-21 05:48:43'),(14,35,150000.00,'2026-02-21 05:48:55'),(15,7,70000.00,'2026-02-21 05:49:20'),(17,6,280000.00,'2026-02-21 05:49:26'),(20,38,280000.00,'2026-02-21 05:50:04'),(21,32,70000.00,'2026-02-21 05:50:26'),(22,31,70000.00,'2026-02-21 05:50:32'),(23,30,70000.00,'2026-02-21 05:50:39'),(24,29,70000.00,'2026-02-21 05:50:45'),(25,28,70000.00,'2026-02-21 05:50:54'),(26,27,70000.00,'2026-02-21 05:50:59'),(27,25,70000.00,'2026-02-21 05:51:05'),(28,26,70000.00,'2026-02-21 05:51:11'),(29,24,70000.00,'2026-02-21 05:51:18'),(30,21,70000.00,'2026-02-21 05:51:26'),(31,19,70000.00,'2026-02-21 05:51:31'),(32,20,70000.00,'2026-02-21 05:51:38'),(33,18,70000.00,'2026-02-21 05:51:44'),(34,17,70000.00,'2026-02-21 05:51:51'),(35,16,70000.00,'2026-02-21 05:51:58'),(36,15,70000.00,'2026-02-21 05:52:04'),(37,14,70000.00,'2026-02-21 05:52:10'),(38,12,70000.00,'2026-02-21 05:52:17'),(39,11,70000.00,'2026-02-21 05:52:22'),(40,10,70000.00,'2026-02-21 05:52:35'),(41,9,70000.00,'2026-02-21 05:52:41'),(42,8,70000.00,'2026-02-21 05:52:47');
/*!40000 ALTER TABLE `teacher_task_rates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teacher_tasks`
--

DROP TABLE IF EXISTS `teacher_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `teacher_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `teacher_id` varchar(10) NOT NULL,
  `title` varchar(150) NOT NULL,
  `description` text,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `status` enum('aktif','nonaktif') NOT NULL DEFAULT 'aktif',
  `nominal` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tt_teacher` (`teacher_id`),
  KEY `idx_tt_status` (`status`),
  CONSTRAINT `fk_tt_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teacher_tasks`
--

LOCK TABLES `teacher_tasks` WRITE;
/*!40000 ALTER TABLE `teacher_tasks` DISABLE KEYS */;
/*!40000 ALTER TABLE `teacher_tasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teachers`
--

DROP TABLE IF EXISTS `teachers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `teachers` (
  `id` varchar(10) NOT NULL,
  `user_id` int DEFAULT NULL,
  `nip` varchar(20) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `classification` varchar(50) DEFAULT NULL,
  `tmt` int DEFAULT NULL,
  `gender` char(1) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `address` text,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `specialization` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `photo_url` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_teachers_user` (`user_id`),
  KEY `idx_teachers_active` (`is_active`),
  CONSTRAINT `fk_teachers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teachers`
--

LOCK TABLES `teachers` WRITE;
/*!40000 ALTER TABLE `teachers` DISABLE KEYS */;
/*!40000 ALTER TABLE `teachers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transport_manual`
--

DROP TABLE IF EXISTS `transport_manual`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transport_manual` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guru_id` varchar(10) NOT NULL,
  `periode` varchar(7) NOT NULL,
  `transport_hari` int DEFAULT '0',
  `transport_acara` int DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_transport` (`guru_id`,`periode`),
  KEY `idx_transport_periode` (`periode`),
  CONSTRAINT `fk_transport_guru` FOREIGN KEY (`guru_id`) REFERENCES `guru` (`guru_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transport_manual`
--

LOCK TABLES `transport_manual` WRITE;
/*!40000 ALTER TABLE `transport_manual` DISABLE KEYS */;
INSERT INTO `transport_manual` VALUES (5,'43','2026-01',5,0),(6,'43','2026-02',5,0),(9,'47','2026-01',5,0),(10,'47','2026-02',5,0),(11,'25','2026-01',5,0),(12,'25','2026-02',5,0),(13,'69','2026-01',25,0),(14,'69','2026-02',25,0);
/*!40000 ALTER TABLE `transport_manual` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `password_salt` varchar(255) NOT NULL,
  `role` enum('admin','guru') NOT NULL DEFAULT 'admin',
  `display_name` varchar(100) DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','UZNCznTaAsZ0Sbcnoynz8R0ClViLWU3PtWbLPdD6Tcw2Wck8/Ffo2SyrMdBto8zqsdMOr2doz8rHICE/HE0KhA==','E9Aa5F26nsIqYyyhq+20jw==','admin','Administrator','2026-05-26 23:20:07','2026-02-06 09:17:29','2026-05-26 16:20:07');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-27  6:45:19

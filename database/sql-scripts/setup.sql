ALTER USER 'root'@'localhost' IDENTIFIED BY 'testingpassword';

CREATE TABLE `Client` (
  `client_id` int not null auto_increment,
  `companyName` text,
  `comments` text,
  PRIMARY KEY (`client_id`)
);

CREATE TABLE `ClientSite` (
  `client_site_id` int not null auto_increment,
  `client_id` text,
  `name` text,
  `address` text,
  `comments` text,
  PRIMARY KEY (`client_site_id`)
);

CREATE TABLE `PointOfContact` (
  `point_of_contact_id` int not null auto_increment,
  `client_id` int,
  `name` text,
  `email` text,
  `phone` text,
  `job_title` text,
  `comments` text,
  PRIMARY KEY (`point_of_contact_id`)
);

CREATE TABLE `Supplier` (
  `supplier_id` int not null auto_increment,
  `name` text,
  `email` text,
  `phone` int,
  `point_of_contact_id` int,
  PRIMARY KEY (`supplier_id`)
);

CREATE TABLE `MaterialCost` (
  `material_cost_id` int not null auto_increment,
  `quote_id` int,
  `bill_of_materials_entry_id` int,
  `materialCost` float,
  `contigency` float,
  `freight` float,
  `taxes` float,
  `profit` float,
  `unitCost` float,
  `extMaterialCost` float,
  `taxFreight` float,
  `cost` float,
  `supplier_id` float,
  `supplier_quote` text,
  PRIMARY KEY (`material_cost_id`)
);

CREATE TABLE `LaborCost` (
  `labor_cost_id` int not null auto_increment,
  `quote_id` int,
  `bill_of_materials_entry_id` int,
  `workers` int,
  `hours` float,
  `costWorker` float,
  `extCost` float,
  `ratio` float,
  `unitCost` float,
  `totalCost` float,
  PRIMARY KEY (`labor_cost_id`)
);

CREATE TABLE `BillOfMaterials_Entry` (
  `bill_of_materials_entry_id` int not null auto_increment,
  `quote_id` int,
  `item_id` int,
  `quantity` int,
  `workers` int, 
  `unitHours` float,
  `rate` float,
  `materialCost` float, 
  `contingencyPercent` float,
  `freightPercent` float, 
  `profitMarkup` float,
  `supplier` text,
  PRIMARY KEY (`bill_of_materials_entry_id`)
);

CREATE TABLE `Item` (
  `item_id` int not null auto_increment,
  `name` text,
  `partNumber` text,
  `manufacturer` text,
  `description` text,
  PRIMARY KEY (`item_id`)
);

CREATE TABLE `Attachment` (
  `attachment_id` int not null auto_increment,
  `title` text,
  `file` text,
  `description` text,
  PRIMARY KEY (`attachment_id`)
);

CREATE TABLE `User` (
  `user_id` varchar(250),
  `name` text,
  `email` text,
  PRIMARY KEY (`user_id`)
);

CREATE TABLE `State` (
  `state_id` int not null auto_increment,
  `name` text,
  PRIMARY KEY (`state_id`)
);

CREATE TABLE `Lead` (
  `lead_id` int not null auto_increment,
  `state_id` int,
  `client_id` int,
  `client_site_id` int,
  `point_of_contact_id` int,
  `assigned_employee_id` varchar(250),
  `title` text,
  `dueDate` text,
  `dateReceived` text,
  `dateCreated` text,
  `projectDescription` text,
  `comments` text,
  PRIMARY KEY (`lead_id`)
);

CREATE TABLE `Quote` (
  `quote_id` int not null auto_increment,
  `r2_id` text,
  `lead_id` int,
  `state_id` int,
  `client_id` int,
  `client_site_id` int,
  `point_of_contact_id` int,
  `dueDate` text,
  `dateCreated` text,
  `dateReceived` text,
  `title` text,
  `projectDescription` text,
  `comments` text,
  `current_employee_id` varchar(250),
  `proposalSpecifications` text,
  PRIMARY KEY (`quote_id`)
);


-- RazdolziSe mobile — Friends feature schema additions
--
-- Adds one new table (Friendships) and, if you already ran an earlier version
-- of SCHEMA_UPDATE_PHASE_1-4.sql (before Friends existed), brings
-- AppNotifications up to its current shape (a Type column, and TripId
-- relaxed to nullable so friend-request notifications — which aren't
-- trip-scoped — can be stored too). Additive only, no existing row is deleted
-- or rewritten in a way that loses data.
--
-- How to run: same as SCHEMA_UPDATE_PHASE_1-4.sql — TiDB Cloud's SQL Editor
-- or any MySQL client, against the TripSplitDb database.

-- === AppNotifications: only run this section if the table already exists
-- from an earlier run of SCHEMA_UPDATE_PHASE_1-4.sql without a Type column.
-- If you're running SCHEMA_UPDATE_PHASE_1-4.sql for the first time today, its
-- CREATE TABLE already includes Type/nullable TripId — skip this section
-- entirely, running it against a table that already has Type will error on
-- the ADD COLUMN line (harmless, just means you can skip straight to the
-- Friendships table below). ===

ALTER TABLE `AppNotifications` ADD COLUMN `Type` varchar(32) NULL;
UPDATE `AppNotifications` SET `Type` = 'PaymentReceived' WHERE `Type` IS NULL;
ALTER TABLE `AppNotifications` MODIFY COLUMN `Type` varchar(32) NOT NULL;
ALTER TABLE `AppNotifications` MODIFY COLUMN `TripId` char(36) COLLATE ascii_bin NULL;

-- === New table: Friendships ===

-- One row per friend relationship, Pending or Accepted (Status: 0 = Pending,
-- 1 = Accepted — EF stores the C# enum as a plain int by convention). A
-- declined/cancelled request is deleted outright rather than kept as a row
-- with a third status — see Friendship.cs's class comment for why.
CREATE TABLE `Friendships` (
  `Id` char(36) COLLATE ascii_bin NOT NULL,
  `RequesterId` char(36) COLLATE ascii_bin NOT NULL,
  `AddresseeId` char(36) COLLATE ascii_bin NOT NULL,
  `Status` int NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `RespondedAt` datetime(6) NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `IX_Friendships_RequesterId_AddresseeId` (`RequesterId`, `AddresseeId`),
  KEY `IX_Friendships_RequesterId` (`RequesterId`),
  KEY `IX_Friendships_AddresseeId` (`AddresseeId`),
  CONSTRAINT `FK_Friendships_Users_RequesterId` FOREIGN KEY (`RequesterId`) REFERENCES `Users` (`Id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_Friendships_Users_AddresseeId` FOREIGN KEY (`AddresseeId`) REFERENCES `Users` (`Id`) ON DELETE RESTRICT
);

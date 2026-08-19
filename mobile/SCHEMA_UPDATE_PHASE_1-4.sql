-- RazdolziSe mobile — Phase 1-4 schema additions
--
-- What this does: relaxes two existing columns to nullable and adds new
-- columns plus one new table. It does NOT drop, rename, or rewrite any
-- existing row — every existing trip/expense/user in TripSplitDb is
-- untouched. Safe to run against the live TripSplitDb database shared with
-- the original web app: the web app's EF model has no idea these new
-- columns/table exist and never queries them, and relaxing Email/PasswordHash
-- to nullable doesn't affect rows that already have both set.
--
-- How to run: open TiDB Cloud's console -> your cluster -> SQL Editor (or
-- connect with any MySQL client using the host/user/password already in
-- mobile/backend/appsettings.json), select the TripSplitDb database, and run
-- the statements below in order. If your TiDB Cloud plan supports it,
-- consider taking a backup/snapshot first — this is additive and low-risk,
-- but any live-database change is worth being able to undo.
--
-- After running this, EnsureCreated() will find every table/column it expects
-- already present and won't try to do anything further — this file *is* the
-- migration, there's nothing else to run.

-- === Users table ===

-- Guest accounts (Phase 1) have neither an email nor a password until they
-- optionally link one later (Phase 2).
ALTER TABLE `Users` MODIFY COLUMN `Email` varchar(320) NULL;
ALTER TABLE `Users` MODIFY COLUMN `PasswordHash` longtext NULL;

ALTER TABLE `Users`
  ADD COLUMN `DeviceId` varchar(64) NULL,
  ADD COLUMN `IsGuest` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN `IsEmailVerified` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN `VerificationCode` varchar(8) NULL,
  ADD COLUMN `VerificationCodeExpiresAt` datetime(6) NULL,
  ADD COLUMN `RefreshTokenHash` varchar(64) NULL,
  ADD COLUMN `RefreshTokenExpiresAt` datetime(6) NULL,
  ADD COLUMN `Tag` varchar(4) NULL;

ALTER TABLE `Users` ADD UNIQUE INDEX `IX_Users_DeviceId` (`DeviceId`);
ALTER TABLE `Users` ADD INDEX `IX_Users_RefreshTokenHash` (`RefreshTokenHash`);
ALTER TABLE `Users` ADD UNIQUE INDEX `IX_Users_Tag` (`Tag`);

-- === Trips table ===

-- Lets someone join a trip by code/QR instead of only via an email invite —
-- nullable so existing trips just get one lazily backfilled the next time
-- they're loaded (see TripService.EnsureJoinCodeAsync), no need to
-- pre-populate this column here.
ALTER TABLE `Trips` ADD COLUMN `JoinCode` varchar(8) NULL;
ALTER TABLE `Trips` ADD UNIQUE INDEX `IX_Trips_JoinCode` (`JoinCode`);

-- === New table: AppNotifications ===
--
-- NOTE: if you already ran an earlier version of this file (before the
-- Friends feature existed), this CREATE TABLE will fail because the table
-- already exists — that's fine, it means you already have it. Skip straight
-- to SCHEMA_UPDATE_PHASE_6_FRIENDS.sql instead, which ALTERs this table to
-- match the shape below rather than creating it fresh.
--
-- "X paid you back" plus friend-request notifications (see
-- SCHEMA_UPDATE_PHASE_6_FRIENDS.sql). Inactivity nudges are computed on the
-- fly and never stored here (see AppNotificationService.GetInactivityNudgesAsync).
-- TripId is nullable — only trip-scoped kinds (PaymentReceived) have one.
CREATE TABLE `AppNotifications` (
  `Id` char(36) COLLATE ascii_bin NOT NULL,
  `UserId` char(36) COLLATE ascii_bin NOT NULL,
  `Type` varchar(32) NOT NULL,
  `TripId` char(36) COLLATE ascii_bin NULL,
  `Message` longtext NOT NULL,
  `CreatedAt` datetime(6) NOT NULL,
  `IsRead` tinyint(1) NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `IX_AppNotifications_UserId_CreatedAt` (`UserId`, `CreatedAt`),
  KEY `IX_AppNotifications_TripId` (`TripId`),
  CONSTRAINT `FK_AppNotifications_Users_UserId` FOREIGN KEY (`UserId`) REFERENCES `Users` (`Id`) ON DELETE CASCADE,
  CONSTRAINT `FK_AppNotifications_Trips_TripId` FOREIGN KEY (`TripId`) REFERENCES `Trips` (`Id`) ON DELETE RESTRICT
);

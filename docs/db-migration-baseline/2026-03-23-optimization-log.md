# SQL Optimization Log (2026-03-23)

## Phase 1 - Compatible schema extension

Executed DDL:

```sql
ALTER TABLE `TravelOrder`
  ADD COLUMN `amountDec` DECIMAL(10,2) NULL,
  ADD COLUMN `discountDec` DECIMAL(10,2) NULL,
  ADD COLUMN `payableDec` DECIMAL(10,2) NULL,
  ADD COLUMN `peopleCountInt` INT NULL,
  ADD COLUMN `travelDateStartDate` DATE NULL,
  ADD COLUMN `travelDateEndDate` DATE NULL;

ALTER TABLE `ServicePeriod`
  ADD COLUMN `priceDec` DECIMAL(10,2) NULL,
  ADD COLUMN `minGroupInt` INT NULL,
  ADD COLUMN `remainingSeatsInt` INT NULL,
  ADD COLUMN `dateStartDate` DATE NULL,
  ADD COLUMN `dateEndDate` DATE NULL;

CREATE INDEX `idx_travel_order_status_created`
ON `TravelOrder` (`status`, `createdAtTs`);
```

Request IDs:

- `0d752d72-8af0-47bd-a0fd-74d7ef2b3ecf`
- `c762e590-cd0b-45a7-87b1-b1961bf2789a`
- `97da0d6f-b4b6-4f3e-a49a-25b4b2936caa`

## Phase 2 - Backfill and verification

Backfill DML:

```sql
UPDATE `TravelOrder`
SET
  `amountDec` = CAST(`amount` AS DECIMAL(10,2)),
  `discountDec` = CAST(IFNULL(`discount`,0) AS DECIMAL(10,2)),
  `payableDec` = CAST(`payable` AS DECIMAL(10,2)),
  `peopleCountInt` = CAST(`peopleCount` AS SIGNED),
  `travelDateStartDate` = STR_TO_DATE(NULLIF(`travelDateStart`, ''), '%Y-%m-%d'),
  `travelDateEndDate` = STR_TO_DATE(NULLIF(`travelDateEnd`, ''), '%Y-%m-%d');

UPDATE `ServicePeriod`
SET
  `priceDec` = CAST(`price` AS DECIMAL(10,2)),
  `minGroupInt` = CAST(`minGroup` AS SIGNED),
  `remainingSeatsInt` = CAST(`remainingSeats` AS SIGNED),
  `dateStartDate` = STR_TO_DATE(NULLIF(`dateStart`, ''), '%Y-%m-%d'),
  `dateEndDate` = STR_TO_DATE(NULLIF(`dateEnd`, ''), '%Y-%m-%d');

UPDATE `TravelOrder`
SET
  `travelDateStartDate` = COALESCE(`travelDateStartDate`, STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(`serviceSnapshotJson`, '$.travelPeriod.dateStart')), '%Y-%m-%d')),
  `travelDateEndDate` = COALESCE(`travelDateEndDate`, STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(`serviceSnapshotJson`, '$.travelPeriod.dateEnd')), '%Y-%m-%d')),
  `travelDateStart` = COALESCE(`travelDateStart`, JSON_UNQUOTE(JSON_EXTRACT(`serviceSnapshotJson`, '$.travelPeriod.dateStart'))),
  `travelDateEnd` = COALESCE(`travelDateEnd`, JSON_UNQUOTE(JSON_EXTRACT(`serviceSnapshotJson`, '$.travelPeriod.dateEnd')))
WHERE
  (`travelDateStartDate` IS NULL OR `travelDateEndDate` IS NULL OR `travelDateStart` IS NULL OR `travelDateEnd` IS NULL)
  AND `serviceSnapshotJson` IS NOT NULL
  AND `serviceSnapshotJson` <> ''
  AND JSON_VALID(`serviceSnapshotJson`) = 1;
```

Verification summary:

- `TravelOrder` totals: `1`
- `ServicePeriod` totals: `27`
- New-field null count: `0`
- Amount/payable mismatch count: `0`
- Price mismatch count: `0`
- Invalid `serviceSnapshotJson`: `0`
- Invalid `travelersJson`: `0`

Verification request IDs:

- `12437b86-1e71-4be1-ac58-26d5d38120e9`
- `c7b21072-a738-41d2-a61b-2d1775d09947`
- `ba065ad3-ae97-49de-a044-9dbff2cc6da6`
- `bc34fb75-2b95-469d-87af-29473ce2605c`
- `44dd94d5-0918-4e7b-8b5e-e49a67c0d818`
- `46eb64e3-b9f6-4f1d-8f37-7f17e17a84a5`
- `5c477a6a-63eb-4e9a-9336-f5760a7021d1`

## Phase 4 - Deprecated fields cleanup

Executed DDL:

```sql
ALTER TABLE `TravelOrder`
  DROP COLUMN `contactName-drop-1774251802`,
  DROP COLUMN `contactPhone-drop-1774251802`,
  DROP COLUMN `createdAtText`;
```

Request ID:

- `33664ea6-4ce8-4b66-8c9a-dcc5b823a578`

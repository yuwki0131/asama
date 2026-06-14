# コンテンツ定義

## UnitDefinition

必要フィールド:

- id
- displayName
- category
- maxHp
- moveSpeed
- attackDamage
- attackInterval
- attackRange
- targetModifiers
- recruitmentCost
- recruitSlotCost
- recruitBuilding
- abilities
- assetId

## BuildingDefinition

必要フィールド:

- id
- displayName
- category
- footprint
- buildCost
- maxHp
- blocksMovement
- blocksLineOfSight
- enterable
- capacity
- buildRules
- assetId

## StorehouseDefinition

- capacity
- footprint
- maxHp
- buildCost

## TerrainDefinition

- id
- movementCost
- buildable
- passable
- elevationRules
- assetId

## SiegeActionDefinition

### Ladder

- placementDuration
- maxHp
- validTargetRules

### FillMoat

- durationTicks
- preserveProgressOnInterrupt
- validTerrain
- resultTerrain

## TenshuStyleDefinition

- id
- displayName
- assetId
- footprint
- optionalStatModifiers

## 調整原則

すべての数値は定義データから変更可能とし、ゲームルール本体に兵種名や建物名による分岐を増やしません。

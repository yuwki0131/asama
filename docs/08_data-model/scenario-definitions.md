# シナリオ定義

## 基本フィールド

- id
- displayName
- mapId
- durationTicks
- playerSide
- initialResources
- initialPopulation
- initialSupport
- initialRecruitment
- honmaru
- initialBuildings
- initialUnits
- events
- victoryConditions
- defeatConditions

## 本丸

```text
mode: player_select | predefined
cells: predefined時のみ
maxArea: player_select時
```

## イベント

MVPのイベント種別:

- spawnUnits
- spawnSupplyCart
- setSiegeState
- grantResources
- showMessage
- setAiProfile
- finishScenario

## AI波

- startTime
- spawnPointId
- unitComposition
- supplyCarts
- aiProfile
- targetPreference

## 補給荷車

- owner
- position / spawnPointId
- foodAmount
- spawnCondition
- repeatCount
- repeatInterval

## 収穫外部搬入口

マップまたはシナリオでID参照します。

## 勝敗条件

- holdHonmaruUntil
- captureHonmaru
- defenderFoodZero
- attackerFoodZero
- attackerUnitsEliminated
- defenderUnitsEliminated

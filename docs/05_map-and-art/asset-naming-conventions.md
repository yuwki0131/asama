# アセット命名規則

## 基本形式

```text
<category>_<id>_<direction>_<state>_<frame>.<ext>
```

## 方向

- ne
- se
- sw
- nw

方向不要の場合は省略可能です。

## 建物例

```text
building_yagura_small_ne_idle.png
building_storehouse_se_destroyed.png
building_tenshu_matsumoto_ne_idle.png
```

## ユニット例

```text
unit_ashigaru_spear_ne_walk_03.png
unit_engineer_sw_work_05.png
unit_supply_cart_se_idle_00.png
```

## 地形例

```text
terrain_grass_01.png
terrain_road_ne_sw_02.png
terrain_dry_moat_corner_ne.png
```

## アトラス

```text
atlas_units_common.png
atlas_units_common.json
atlas_buildings_castle.png
atlas_buildings_castle.json
```

## ID規則

- 小文字snake_case
- 表示名と永続IDを分離
- 一度公開したIDは変更しない
- 実在城名は外観様式IDに使用可

例:

```text
tenshu_style_matsumoto
unit_ashigaru_spear
building_storehouse_basic
```

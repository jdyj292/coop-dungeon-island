-- 강화 자동 (skills.md 1장): 같은 카드 3장(combat.json card.mergeCount)을 모아 두고 강화하지 않은 기록을 강화한다. 남는 장수는 그대로 (직접 갈기)
UPDATE `cards` SET `enhanced` = 1, `count` = `count` - 3 WHERE `enhanced` = 0 AND `count` >= 3;

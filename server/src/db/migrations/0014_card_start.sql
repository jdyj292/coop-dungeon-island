-- 기록 초기화 (skills.md 1장): 지금 있는 모든 계정에 무기별 처음 카드 1장씩 + 환영 선물 팩 1 3개.
-- 처음 카드는 이 마이그레이션 시점의 cards.json starter (새 계정은 http/accounts.ts가 데이터에서 읽어 줌)
INSERT OR IGNORE INTO `cards` (`user_id`, `card_id`, `count`, `enhanced`) SELECT `id`, 'gs_launch', 1, 0 FROM `users`;--> statement-breakpoint
INSERT OR IGNORE INTO `cards` (`user_id`, `card_id`, `count`, `enhanced`) SELECT `id`, 'gs_earthsplit', 1, 0 FROM `users`;--> statement-breakpoint
INSERT OR IGNORE INTO `cards` (`user_id`, `card_id`, `count`, `enhanced`) SELECT `id`, 'st_fireburst', 1, 0 FROM `users`;--> statement-breakpoint
INSERT OR IGNORE INTO `cards` (`user_id`, `card_id`, `count`, `enhanced`) SELECT `id`, 'st_icefield', 1, 0 FROM `users`;--> statement-breakpoint
INSERT INTO `inventory` (`user_id`, `item_id`, `count`) SELECT `id`, 'cardpack_gift_1', 3 FROM `users` WHERE true
  ON CONFLICT (`user_id`, `item_id`) DO UPDATE SET `count` = `count` + 3;

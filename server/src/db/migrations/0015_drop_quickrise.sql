-- 공용 패시브 기상 회피 삭제 (skills.md 1장): 보유·장착 기록을 지운다 (패시브 칸 순서는 slot 정렬이라 빈 번호가 있어도 됨)
DELETE FROM `card_slots` WHERE `card_id` IN ('greatsword.quickrise', 'staff.quickrise');--> statement-breakpoint
DELETE FROM `cards` WHERE `card_id` IN ('greatsword.quickrise', 'staff.quickrise');

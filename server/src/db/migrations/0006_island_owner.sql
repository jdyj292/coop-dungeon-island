-- 이미 있는 섬의 주인 = 그 섬에서 가장 먼저 가입한 주민 (지금까지는 섬을 만든 사람만 먼저 가입할 수 있었음, island.md 7장)
UPDATE `islands` SET `owner_id` = (SELECT MIN(`id`) FROM `users` WHERE `users`.`island_id` = `islands`.`id`);

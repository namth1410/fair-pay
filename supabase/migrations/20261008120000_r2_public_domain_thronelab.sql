-- Đổi domain public của bucket R2 `fairpay`: fairpay.namth.online → fairpay.thronelab.online (2026-10-08).
--
-- Bối cảnh: fairpay.namth.online trả Cloudflare 522 cho MỌI object (liên kết R2 custom
-- domain đứt dù dashboard R2 vẫn báo Active; zone namth.online nằm ở tài khoản Cloudflare
-- khác zone thronelab.online). App Android vẫn "thấy ảnh" chỉ vì RN Image cache trên máy.
-- Bucket nay gắn custom domain fairpay.thronelab.online (đã kiểm: ảnh cũ + mới đều 200).
--
-- Chỉ đổi phần host của URL đã lưu; object key giữ nguyên nên không cần copy file.
-- UPDATE kích hoạt trigger bump_version_and_updated_at → updated_at mới → pull delta của
-- app kéo URL mới về local mirror. audit_logs giữ nguyên (lịch sử).
--
-- Đi kèm (ngoài migration): secret Edge Functions `R2_PUBLIC_BASE_URL` phải đổi sang
-- https://fairpay.thronelab.online để ảnh upload sau sinh URL đúng + extractFileKey()
-- nhận ra file cũ khi thay/xoá ảnh.

UPDATE public.groups
   SET avatar_url = replace(avatar_url, 'https://fairpay.namth.online/', 'https://fairpay.thronelab.online/')
 WHERE avatar_url LIKE 'https://fairpay.namth.online/%';

UPDATE public.expenses
   SET image_url = replace(image_url, 'https://fairpay.namth.online/', 'https://fairpay.thronelab.online/')
 WHERE image_url LIKE 'https://fairpay.namth.online/%';

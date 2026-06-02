-- Bỏ audit-trigger TRÙNG LẶP trên expenses/payments.
--
-- Bug: trigger `trg_expense_audit` (func log_expense_change) ghi 'expense.create'
-- MỖI INSERT expense, nhưng RPC create_expense ĐÃ gọi _log_action('expense.create')
-- → 2 dòng audit cho 1 expense. Tương tự:
--   - delete: RPC delete_expense + branch soft-delete của trigger
--   - payments: RPC create_payment/delete_payment + trg_payment_audit
--
-- 2 trigger + 2 func này KHÔNG nằm trong migration history của repo (schema drift —
-- được thêm trực tiếp trên dashboard từ thời chưa có RPC). Nguồn audit đúng là RPC vì:
--   - actor = auth_user_id() (chống spoof) thay vì NEW.created_by/recorded_by
--   - after_data curated khớp HistoryTab.getActionDetail + notification fan-out
--   - delete có guard "chỉ log khi flip NULL→ts"
-- Mọi write expense/payment trên server đều đi qua RPC (kể cả offline replay qua
-- pushDispatcher) nên bỏ trigger KHÔNG mất sự kiện nào.
--
-- Phụ: branch UPDATE→'expense.edit' của trigger còn ghi nhiễu mỗi lần imageUploadWorker
-- UPDATE image_url (đính ảnh bị log thành "Sửa khoản chi"). App không có tính năng sửa
-- expense → không cần audit này.

DROP TRIGGER IF EXISTS trg_expense_audit ON public.expenses;
DROP TRIGGER IF EXISTS trg_payment_audit ON public.payments;

DROP FUNCTION IF EXISTS public.log_expense_change();
DROP FUNCTION IF EXISTS public.log_payment_change();

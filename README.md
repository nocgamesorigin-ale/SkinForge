# SkinForge

Công cụ reskin art cho game: quét asset của game, gửi brief cho artist, kiểm tra ảnh mới và áp dụng vào game.
Chạy hoàn toàn trong trình duyệt — **ảnh không rời khỏi máy bạn**, repo này chỉ chứa code.

**Dùng online:** https://nocgamesorigin-ale.github.io/SkinForge/

## Luồng làm việc

1. **Mở thư mục game** (Chrome/Edge). SkinForge nhận diện engine (Falcon IDE, GameKit, Vite, Unity, Godot…), tìm thư
   mục asset (`src/assets`, `assets`, `public`, `Assets`…), quét mọi ảnh PNG/JPG/WebP và lập danh sách: tên, kích thước,
   nền trong suốt, nhóm, bộ ảnh (`<tên>_0 … <tên>_n` cùng kích thước).
2. **Xuất brief cho artist** → `<game>_brief.zip`: ảnh gốc PNG + `brief.json` + hướng dẫn. Artist mở zip này trên cùng
   trang (chế độ Artist, chạy cả Firefox/Safari), kéo thả ảnh đã vẽ để tự kiểm tra, rồi **Xuất gói reskin**.
3. **Nhập gói reskin** (hoặc kéo thả ảnh / thư mục / zip) → tự khớp theo tên file và đường dẫn, chạy kiểm tra.
4. **Áp dụng vào game** → mỗi ảnh được xuất đúng **kích thước và định dạng của ảnh gốc** rồi ghi đè; ảnh cũ được sao
   lưu, có nút hoàn tác. Công cụ build của game (Falcon IDE, GameKit, Vite dev server…) tự build lại khi file đổi.

## Quy tắc kiểm tra

Mỗi nhóm (thư mục cấp 1 trong thư mục asset) có một quy tắc, đổi được trong cột trái:

| Quy tắc | Dùng cho | Kiểm tra |
|---|---|---|
| **Khung tự do** | Đồ vật, nhân vật, vật phẩm (mặc định cho nhóm có bộ ảnh) | Dáng và kích thước món đồ tự do; ảnh được co vừa khung gốc, không méo. Cảnh báo khi món đồ quá nhỏ / sát mép so với vùng an toàn (70–90%). |
| **Giữ tỉ lệ khung** | Nút, banner, icon, nền | Tỉ lệ khung phải khớp ảnh gốc (sai số 2% hoặc 1 px). |

Luôn kiểm tra: tên file khớp · nền trong suốt khi ảnh gốc có alpha · độ phân giải đủ.
Với **bộ ảnh**: các ảnh reskin trong cùng bộ phải trùng vị trí và cỡ với nhau (không cần khớp ảnh gốc).
**Tự cắt & căn**: cắt theo vùng có hình chung của cả bộ, phóng vừa 86% khung, áp dụng như nhau cho mọi ảnh trong bộ.

## Dữ liệu SkinForge ghi vào thư mục game

```
<game>/.reskin/
  project.json          quy tắc từng nhóm, thông số tự căn, lần sao lưu gần nhất
  source/…              ảnh gốc artist gửi (để mở lại project, xuất lại sau này)
  backup/<thời-gian>/…  ảnh của game trước mỗi lần áp dụng
```

Nên thêm `.reskin/backup/` (và tuỳ ý `.reskin/source/`) vào `.gitignore` của game.

## Phát triển

```bash
npm install
npm run dev      # http://localhost:8798
npm run build    # dist/
```

Mỗi lần push lên `main`, `.github/workflows/deploy.yml` build và đăng lên GitHub Pages
(Settings → Pages → Source: **GitHub Actions**).

- `src/fsx.js` — đọc/ghi thư mục (File System Access API), nhận diện engine, project gần đây (IndexedDB).
- `src/imaging.js` — phân tích ảnh (kích thước, alpha, vùng có hình), dựng ảnh xuất vào khung gốc.
- `src/project.js` — slot, nhóm, bộ ảnh, khớp tên, các bước kiểm tra, tự căn.
- `src/zipx.js` — gói brief / gói reskin (fflate).
- `src/main.js` — giao diện.

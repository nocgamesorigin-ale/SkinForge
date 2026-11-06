# SkinForge

Công cụ reskin art cho game: quét asset của game, gửi brief cho artist, kiểm tra ảnh mới và áp dụng vào game.
Chạy hoàn toàn trong trình duyệt — **ảnh không rời khỏi máy bạn**, repo này chỉ chứa code.

**Dùng online:** https://nocgamesorigin-ale.github.io/SkinForge/

## Hai chế độ

Lần đầu mở, SkinForge hỏi vai trò (nhớ trên máy, đổi được ở công tắc trên thanh đầu):

- **Game Design** — người giữ thư mục dự án (Chrome/Edge): thêm thư mục dự án, xuất brief, nhận gói reskin
  (kéo thả `*_reskin.zip` vào trang chủ → tự mở đúng dự án), **tự thay âm thanh**, kiểm tra, áp dụng vào game. Mỗi thẻ
  dự án hiện trạng thái (Chưa gửi brief → Đã gửi brief · chờ artist → Có gói reskin mới → Đã áp dụng) và có nhật ký.
- **Artist / Anim** — chỉ có **Mở gói (brief / reskin)** và **Project đang làm**. Artist làm **Art**, Anim làm **Effect**
  (lọc riêng trong workspace). Gói brief và file đã kéo vào được lưu trong trình duyệt (IndexedDB) để mở lại làm tiếp;
  trạng thái Mới nhận → Đang làm → Đã gửi. Chạy trên mọi trình duyệt.

## Loại asset

| Loại | Nhận diện | Ai làm | Kiểm tra |
|---|---|---|---|
| **Art** | mọi ảnh còn lại | Artist (trong brief) | theo quy tắc nhóm (khung tự do / giữ tỉ lệ) |
| **Effect** | tên/thư mục có `fx`, `vfx`, `effect`, `particle`, `anim`, `sparkle`, `splash`, `glow`, `smoke`, `shine`, `ray`… | Anim (trong brief) | như ảnh |
| **Animation** | Spine (`.json` / `.skel` / `.atlas`), Lottie (`.json` / `.lottie`), sprite sheet (TexturePacker `.json` / `.plist`), DragonBones, Unity `.anim` / `.controller` — `.json` chỉ được nhận khi nội dung đúng là animation | Anim (trong brief, nguyên định dạng; có nút tải file gốc) | cùng định dạng và loại; **còn đủ tên animation / skin / frame / state mà game gọi**; fps, độ dài, texture; khi áp dụng thì chép nguyên file |
| **Âm thanh** | `.mp3 .ogg .wav .m4a .aac` | Game Design (không vào brief) | cùng định dạng với file gốc; độ dài và dung lượng gần bằng; nghe thử gốc/mới; khi áp dụng thì chép nguyên file |

## Màn / popup và yêu cầu

**Tự nhận diện từ code game** (khi mở thư mục lần đầu, hoặc bấm “Quét code game”): SkinForge đọc source của game và tự
tạo danh sách màn / popup kèm asset của từng cái:

- **Game web** (Falcon IDE, GameKit, Vite…): container trong HTML (`<section class="screen">`, `.panel`, `#shopPopup`,
  `<dialog>`…) và mọi element id bên trong; rồi các dòng JS / TS / CSS đụng tới những id đó và gọi tên asset
  (`img/ui/deal_${kind}.webp` → mọi `deal_*`); dữ liệu game dạng JSON (`{"tiers":[{"bg":"bg2"}]}` + `D.tiers` trong code).
  Thư mục toàn bộ ảnh (vd `items/`) được gọi theo biến (`"img/items/" + name`) được ghi là **đổi theo món đang chơi**.
- **Unity**: prefab / scene tên kiểu `*Panel`, `*Popup`, `*Screen`… → GUID sprite → file `.meta` của ảnh.
- **Godot**: `*.tscn` → `ext_resource path="res://…"`.
- Kết quả là gợi ý: Game Design sửa / gán thêm / bỏ bớt như màn tạo tay. Asset có trong code nhưng chưa rõ thuộc màn nào
  được đếm riêng.

**Ảnh tổng thể** của mỗi màn (để Art / Anim thấy popup được ghép bởi những gì): bấm **Chụp từ game** (chọn tab / cửa sổ
game đang mở đúng popup → kéo chọn vùng), **dán** ảnh (Ctrl+V) hoặc **tải ảnh**. Nếu game có sẵn ảnh chụp trong
`<game>/.reskin/shots/<id>.png|webp` (id = id của element / tên prefab, vd `cleanedPanel.webp`) thì được lấy tự động.
Cạnh ảnh là **Ghép bởi**: số ảnh / bộ dùng từ từng thư mục (vd `ui 5 ảnh` + `items 80 bộ · đổi theo món đang chơi`) và
hình nhỏ từng asset (bấm để mở chi tiết).

Game Design cũng có thể tự nhóm asset theo nơi chúng xuất hiện (Popup Complete, Popup Out of Moves, Shop, Main Menu… — có
gợi ý nhanh), rồi ghi yêu cầu cho từng màn:

- **Gán asset:** bấm “Chọn để gán vào màn”, chọn nhiều thẻ (một bộ ảnh tính là một thẻ), chọn màn → **Gán**. Một asset
  có thể thuộc nhiều màn; thẻ hiện chip tên màn.
- **Yêu cầu Art** và **Yêu cầu Anim**: mô tả tự do + **ảnh ref** (kéo vào hoặc chọn file; bấm ảnh để xem lớn).
- Lưu trong `<game>/.reskin/project.json` (màn, asset, mô tả) và `<game>/.reskin/refs/<màn>/<art|anim|shot>/` (ảnh ref, ảnh tổng thể).
- **Liên kết trực tiếp (Artist / Anim):** bấm “Liên kết yêu cầu từ Game Design” và chọn thư mục game (hoặc thư mục `.reskin` của nó — cùng máy, hoặc thư mục đồng bộ Drive / OneDrive), hay “Dùng dự án … trên máy này”. Danh sách màn, ảnh tổng thể, yêu cầu và ảnh ref được đọc thẳng từ `.reskin/` và tự cập nhật vài giây sau khi Game Design sửa — không cần xuất brief lại. Brief cũ cũng thấy màn / popup (tự quét code nếu Game Design chưa quét). Chrome / Edge.
- **Đi theo brief:** Artist / Anim chọn màn ở cột trái để xem ảnh tổng thể, “Ghép bởi”, mô tả + ref (chỉ đọc) và chỉ các asset của màn đó. Mở brief mới của cùng project thì job cũ được cập nhật, ảnh đã vẽ vẫn giữ.

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
- `src/screens.js` — màn / popup, yêu cầu Art / Anim, ảnh ref + ảnh tổng thể, đếm asset theo thư mục.
- `src/detect.js` — tìm màn / popup và asset của chúng trong code game (HTML/JS/CSS/JSON, Unity prefab, Godot tscn).
- `src/zipx.js` — gói brief / gói reskin (fflate).
- `src/main.js` — giao diện.

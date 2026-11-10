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

## Chủ đề: màn, popup, room, level, item

Asset được tách theo **chủ đề** thay vì một danh sách chung. Cột trái chia theo loại (Màn · Popup · Room · Level ·
Item / món · Khác), mỗi chủ đề ghi số Art / Effect / Anim / Âm thanh, ai làm và tiến độ. Có ô lọc chủ đề, và mục
**Chưa thuộc chủ đề nào** cho asset dùng chung / chưa rõ chỗ dùng.

- **Màn / popup**: từ code (xem dưới).
- **Room / Level**: từ tên thư mục / file (`rooms/room_2/…`, `lv3_bg.png`, `room_1.webp`…) và từ dữ liệu game: mảng
  `levels`, `stages`, `rooms`, `tiers`, `chapters`, `worlds`, `items`… trong file JSON, mỗi phần tử một chủ đề kèm tên
  (vd thrift-store: `Room 1 · Thrift & Love` = bg + room_1; `Item 1 · Olive Crossbody Bag` = 5 ảnh + nền).

## Làm việc theo team (thư mục chung)

Đặt thư mục game (hoặc chỉ `.reskin`) ở chỗ cả team cùng thấy (Google Drive / OneDrive đồng bộ, ổ mạng). Mỗi người chỉ
ghi file của mình nên bản đồng bộ không bị đè nhau:

```
<game>/.reskin/team/<tên>.json     ai, nhận phần nào, đã vẽ ảnh nào, đã nộp gì, đang mở chủ đề nào
<game>/.reskin/preview/<tên>/…     ảnh xem trước nhỏ (≤ 320 px) của từng ảnh đang vẽ — tự cập nhật khi vẽ
<game>/.reskin/inbox/<tên>/…       ảnh đã nộp, đúng đường dẫn asset của game
```

- **Game Design** giao chủ đề cho từng người (ô “Giao cho” trên chủ đề). Ở cột trái có **Bài nộp trong thư mục chung**:
  bấm **Nhập** để lấy bài của từng người vào workspace (kiểm tra như gói reskin), rồi Áp dụng.
- **Artist / Anim** liên kết thư mục chung (cấp quyền ghi), nhập tên một lần; **Nhận phần này** trên chủ đề, lọc **Phần
  của tôi**, vẽ và kéo ảnh vào như thường; **Nộp vào thư mục chung** thay cho gửi zip (vẫn xuất zip được).
- **Bảng tiến độ team** (cả hai chế độ): từng người làm phần nào, **đang mở chủ đề nào**, cập nhật lúc nào; từng chủ đề:
  đã vẽ / đã nộp / Game Design đã nhận / tổng. Tự cập nhật vài giây một lần.
- **Xem bài của nhau ngay khi đang vẽ** (cả artist lẫn Game Design): thẻ ảnh có chip **✎ tên** của người đã vẽ ảnh đó; nếu
  mình chưa vẽ thì ô Reskin hiện bản xem trước của họ (“An đang vẽ”, với Game Design là “An đang vẽ · chưa nộp”); mở chi
  tiết có thêm hàng **Bản của <tên>** cho từng người. Hai người vẽ trùng một ảnh thấy ngay.
- **Nhận trùng phần**: bấm “Nhận phần này” trên chủ đề đã có người giao / nhận thì SkinForge hỏi lại trước.

## Màn / popup và yêu cầu

**Tự nhận diện từ code game** (khi mở thư mục lần đầu, hoặc bấm “Quét code game”): SkinForge đọc source của game và tự
tạo danh sách màn / popup kèm asset của từng cái:

- **Game web** (Falcon IDE, GameKit, Vite…): container trong HTML (`<section class="screen">`, `.panel`, `#shopPopup`,
  `<dialog>`…) và mọi element id bên trong; rồi các dòng JS / TS / CSS đụng tới những id đó và gọi tên asset
  (`img/ui/deal_${kind}.webp` → mọi `deal_*`); dữ liệu game dạng JSON (`{"tiers":[{"bg":"bg2"}]}` + `D.tiers` trong code).
  Thư mục toàn bộ ảnh (vd `items/`) được gọi theo biến (`"img/items/" + name`) được ghi là **đổi theo món đang chơi**.
- **Unity**: đọc mọi `.meta` (GUID → file) rồi lần theo tham chiếu từ từng **prefab level / room** (`Levels/12.prefab`,
  `lv3.prefab`…), **scene** và **prefab màn / popup**, xuyên qua các asset trung gian: Sprite `.asset` → texture, material →
  texture, Spine `SkeletonDataAsset` → atlas → material → texture + `.json`, ScriptableObject config… Âm thanh / icon
  game chọn bằng số enum (`pickToolAudioId: 62` → `AudioId.choi_re` → `choi_re.ogg`; `toolName: 36` → icon cùng tên) cũng
  được gán. Level đánh số theo **thứ tự chơi** nếu game có danh sách level (`index` / `levelId`), kèm tên prefab.
  Ảnh đánh số theo level mà prefab không trỏ tới (`lv12_clean`, `icon_win_12`…) vào đúng level đó; dụng cụ / hiệu ứng
  dùng ở nhiều level (≥ 30%) gom vào **Dụng cụ / hiệu ứng dùng chung**; âm thanh code gọi theo tên enum vào **Âm thanh
  chung**. Lần quét lại thay các chủ đề tự tìm cũ chưa ai đụng tới (chưa giao, chưa có yêu cầu / ảnh).
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
   mục asset đầu tiên thật sự có ảnh / âm thanh (`src/assets`, `assets`, `public/assets`, `public/data`, `public`, `Assets`…;
   thư mục có mà trống thì bỏ qua), quét mọi ảnh PNG/JPG/WebP và lập danh sách: tên, kích thước,
   nền trong suốt, nhóm, bộ ảnh (`<tên>_0 … <tên>_n` cùng kích thước).
2. **Xuất brief cho artist** → `<game>_brief.zip`: ảnh gốc PNG + `brief.json` + hướng dẫn. Artist mở zip này trên cùng
   trang (chế độ Artist, chạy cả Firefox/Safari), kéo thả ảnh đã vẽ để tự kiểm tra, rồi **Xuất gói reskin**.
3. **Nhập gói reskin** (hoặc kéo thả ảnh / thư mục / zip) → tự khớp theo tên file và đường dẫn, chạy kiểm tra.
4. **Áp dụng vào game** → mỗi ảnh được xuất đúng **kích thước và định dạng của ảnh gốc** rồi ghi đè; ảnh cũ được sao
   lưu, có nút hoàn tác. Công cụ build của game (Falcon IDE, GameKit, Vite dev server…) tự build lại khi file đổi.
5. **Đẩy lên GitLab (Merge Request)** — tuỳ chọn trong bảng Áp dụng, xem dưới.

## GitLab: chọn nhánh, commit, Merge Request

Bấm **Kết nối GitLab…** trong bảng Áp dụng (một lần cho mỗi dự án, lưu trên máy này): địa chỉ GitLab (gitlab.com hoặc
server công ty), project (`nhom/ten-game`), **Personal Access Token** scope `api` (tài khoản Developer trở lên), nhánh nhận
MR mặc định và thư mục dự án Unity trong repo nếu repo không phải chính dự án Unity. **Kiểm tra kết nối** → **Lưu**.

Từ đó bảng Áp dụng có phần **Đẩy lên GitLab** (giống thao tác commit / push trên Fork), nhớ lựa chọn lần trước:

- **Đẩy vào nhánh**: *Nhánh mới* (gõ tên, vd `art/level-3`, chọn nhánh để tách ra) hoặc *Nhánh có sẵn* (danh sách nhánh
  lấy từ GitLab). Tên trùng nhánh đã có / tên không hợp lệ bị chặn; nhánh protected có cảnh báo.
- **Commit message**: điền sẵn theo level / màn đã đổi, sửa được.
- **Tạo Merge Request vào** nhánh nào (bật / tắt). Nếu nhánh đó đã có MR đang mở vào cùng nhánh đích thì chỉ thêm commit
  vào MR cũ. Tắt MR = chỉ commit + push.

Khi bấm Áp dụng: ghi file vào thư mục game trên máy như trước (sao lưu + hoàn tác), rồi đọc `.gitattributes` của nhánh:

- Không file nào thuộc **Git LFS** → SkinForge gọi GitLab API: commit đúng các file đã đổi lên nhánh đã chọn (nhiều file
  thì chia vài commit ≤ 25 MB), tạo / dùng lại MR, hiện link **Mở Merge Request** / **Xem commit**. Commit nằm trên GitLab,
  ảnh trên máy hiện là file đã sửa (sau khi merge: Discard rồi Pull trong Fork).
- Có file thuộc LFS → kho LFS của GitLab không nhận tải lên từ trang web, nên SkinForge ghi `.reskin/push-reskin.bat`
  (Windows) / `.reskin/push-reskin.sh` (macOS) kèm `push-files.txt`, `push-message.txt`: **bấm đúp** để git trên máy commit
  đúng các file đó lên nhánh đã chọn (Git LFS xử lý như thường) và mở MR bằng push option của GitLab. Script dùng một
  index tạm nên **không đổi nhánh đang làm và không đụng các thay đổi dở** trong thư mục game. Cần git ≥ 2.26 + Git LFS
  đã đăng nhập GitLab.

File `.meta` không bị đụng tới (GUID giữ nguyên). Token chỉ lưu trong trình duyệt của máy đó và chỉ gửi tới GitLab.

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
  team/ preview/ inbox/ tiến độ, ảnh xem trước và bài nộp của từng người (thư mục chung)
  push-reskin.bat|.sh   lệnh commit + push (+ MR) khi repo dùng Git LFS, kèm push-files.txt / push-message.txt
```

Nên thêm `.reskin/` vào `.gitignore` của game (hoặc ít nhất `backup/`, `preview/`, `inbox/`, `push-reskin.*`).

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
- `src/detect.js` — tìm màn / popup / room / level và asset của chúng trong code và dữ liệu game (HTML/JS/CSS/JSON, Unity prefab, Godot tscn, tên file).
- `src/team.js` — tiến độ team và bài nộp qua thư mục chung.
- `src/zipx.js` — gói brief / gói reskin (fflate).
- `src/main.js` — giao diện.

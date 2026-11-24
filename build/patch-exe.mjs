// Sets the Windows icon + version info on the built Studio.exe (pure JS, no Windows needed)
import fs from 'fs';
import * as ResEdit from "resedit";
import * as PE from "pe-library";
const [,, exePath, icoPath, version] = process.argv;
const exe = PE.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = PE.NtExecutableResource.from(exe);
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, iconFile.icons.map((i) => i.data));
const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const vi = vis.length ? vis[0] : ResEdit.Resource.VersionInfo.createEmpty();
const [a, b, c] = version.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033);
vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  FileDescription: 'Studio - free music maker with built-in Auto-Tune', ProductName: 'Studio',
  CompanyName: 'Studio', LegalCopyright: 'Free software', OriginalFilename: 'Studio.exe', InternalName: 'Studio',
  FileVersion: version, ProductVersion: version,
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('patched', exePath);

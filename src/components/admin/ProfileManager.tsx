import { ImagePlus, Loader2, Save, User } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { getSheikhProfile, updateSheikhProfile, uploadPublicAsset } from '../../lib/examService';

interface ProfileManagerProps {
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setNotice: (notice: string) => void;
  setError: (error: string) => void;
}

export default function ProfileManager({
  loading,
  setLoading,
  setNotice,
  setError,
}: ProfileManagerProps) {
  const [profileBio, setProfileBio] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('');
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadProfile() {
      try {
        const p = await getSheikhProfile();
        if (mounted && p) {
          setProfileBio(p.bio || '');
          setProfileAvatar(p.avatar_url || '');
        }
      } catch (err) {
        console.warn('Profile load error:', err);
      }
    }
    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (profileAvatarFile) {
      const url = URL.createObjectURL(profileAvatarFile);
      setProfileAvatarPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setProfileAvatarPreview('');
  }, [profileAvatarFile]);

  function clearProfileAvatarFile() {
    setProfileAvatarFile(null);
    if (profileAvatarInputRef.current) profileAvatarInputRef.current.value = '';
  }

  async function handleProfileUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');

    try {
      let avatarUrl = profileAvatar;
      if (profileAvatarFile) {
        avatarUrl = await uploadPublicAsset(profileAvatarFile, 'profile-images');
      }

      await updateSheikhProfile(profileBio.trim(), avatarUrl);
      setProfileAvatar(avatarUrl);
      clearProfileAvatarFile();
      setNotice('تم تحديث الملف الشخصي بنجاح.');
    } catch (err) {
      setError(err instanceof Error ? `تعذر تحديث الملف الشخصي: ${err.message}` : 'تعذر تحديث الملف الشخصي.');
    } finally {
      setLoading(false);
    }
  }

  const avatarPreviewSrc = profileAvatarPreview || profileAvatar;

  return (
    <div className="admin-grid single-panel-grid">
      <section className="tool-panel">
        <div className="section-heading compact">
          <span className="section-kicker">
            <User size={16} aria-hidden />
            الملف الشخصي
          </span>
          <h3>الملف الشخصي والنبذة للشيخ</h3>
        </div>
        <form className="form-grid" onSubmit={handleProfileUpdate} noValidate>
          <label className="field full">
            <span>نبذة الشيخ (تظهر للزوار في الصفحة الرئيسية)</span>
            <textarea
              value={profileBio}
              onChange={(event) => setProfileBio(event.target.value)}
              placeholder="اكتب نبذة تعريفية قصيرة عن الشيخ محمد أحمد الشموري..."
              rows={5}
            />
          </label>
          <label className="field full">
            <span>صورة الشيخ</span>
            <div className="profile-upload-row">
              <input
                ref={profileAvatarInputRef}
                className="file-input-hidden"
                type="file"
                accept="image/*"
                onChange={(event) => setProfileAvatarFile(event.target.files?.[0] || null)}
              />
              <button
                type="button"
                className="secondary-action"
                onClick={() => profileAvatarInputRef.current?.click()}
              >
                <ImagePlus size={17} aria-hidden />
                {profileAvatarFile || profileAvatar ? 'تغيير الصورة' : 'رفع صورة'}
              </button>
              {(profileAvatarFile || profileAvatar) && (
                <button
                  type="button"
                  className="ghost-action"
                  onClick={() => {
                    setProfileAvatar('');
                    clearProfileAvatarFile();
                  }}
                >
                  إزالة الصورة
                </button>
              )}
              {profileAvatarFile && (
                <span className="selected-file-name">{profileAvatarFile.name}</span>
              )}
            </div>
          </label>
          
          {avatarPreviewSrc && (
            <div className="avatar-preview-container full">
              <span>معاينة الصورة:</span>
              <img
                src={avatarPreviewSrc}
                alt="معاينة الصورة"
                className="avatar-preview-img"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://www.w3schools.com/howto/img_avatar.png';
                }}
              />
            </div>
          )}

          <button className="primary-action" disabled={loading} type="submit">
            {loading ? <Loader2 className="spin" size={18} aria-hidden /> : <Save size={18} aria-hidden />}
            حفظ الملف الشخصي
          </button>
        </form>
      </section>
    </div>
  );
}

# Vaerion RPM spec — Fedora/RHEL/openSUSE delivery channel.
#
# VERIFICATION STATUS: authored on Linux; no rpmbuild in this environment,
# so the spec is syntax-reviewed only. Platform marker: UNVERIFIED — RPM.
# Build (on any RPM host):
#   rpmbuild -bb packaging/linux/vaerion.spec --define "version 0.1.12.rc1"
# (RPM versions cannot contain '-'; the dot form 0.1.12.rc1 is the
#  convention of record here — derived from version_string by replacing
#  the pre-release hyphen with a dot; the register test pins the derivation.)

%global version_string 0.1.12-rc1
%global rpm_version    0.1.12.rc1

Name:           vaerion
Version:        %{rpm_version}
Release:        1%{?dist}
Summary:        AI-native development engine — deterministic, auditable, local-first
License:        Apache-2.0
URL:            https://vaerion.dev
Source0:        %{name}-%{version_string}-source.tar.gz
BuildArch:      noarch
Requires:       curl
Recommends:     bun
Maintainer:     Auren <auren@vaerion.dev>

%description
Vaerion is an AI-native development engine: a deterministic runtime with
broker-governed autonomy, hash-chained journals, receipts, and permanent
provenance for everything it creates. Evidence, not branding.
The engine executes on the Bun runtime (installed separately).

%prep
%setup -c -q

%install
mkdir -p %{buildroot}/usr/lib/vaerion/%{version_string} %{buildroot}/usr/bin
cp -R packages/vaerion/src %{buildroot}/usr/lib/vaerion/%{version_string}/src
cp packages/vaerion/package.json %{buildroot}/usr/lib/vaerion/%{version_string}/package.json
cat > %{buildroot}/usr/bin/vae <<'EOF'
#!/bin/sh
exec bun run "/usr/lib/vaerion/%{version_string}/src/cli/vae.ts" "$@"
EOF
chmod +x %{buildroot}/usr/bin/vae

%files
/usr/bin/vae
/usr/lib/vaerion/%{version_string}/
%license LICENSE

%changelog
* Thu Sep 03 2026 Auren <auren@vaerion.dev> - 0.1.12.rc1-1
- Version-register completion: the spec's version_string/rpm_version/changelog
  aligned to the engine version of record (0.1.12-rc1); pinned by the register test.

* Mon Aug 31 2026 Auren <auren@vaerion.dev> - 0.1.7.rc2-1
- Productization Era: RPM channel authored (UNVERIFIED — RPM until an rpmbuild host runs this spec).

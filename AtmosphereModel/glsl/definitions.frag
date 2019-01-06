// ����define����������ֱ���ĺ���
#define Length float
#define Wavelength	float
#define Angle	 float
#define SolidAngle float
#define Power	 float
#define LuminousPower float

#define Number float
#define InverseLength float
#define Area float
#define Volume float
#define NumberDensity float
#define Irradiance float
#define Radiance float
#define SpectralPower float
#define SpectralIrradiance float
#define SpectralRadiance float
#define SpectralRadianceDensity float
#define ScatteringCoefficient float
#define InverseSolidAngle float

// A generic function from Wavelength to some other type.
#define AbstractSpectrum vec3
// A function from Wavelength to Number.
#define DimensionlessSpectrum vec3
// A function from Wavelength to SpectralPower.
#define PowerSpectrum vec3
// A function from Wavelength to SpectralIrradiance.
#define IrradianceSpectrum vec3
// A function from Wavelength to SpectralRadiance.
#define RadianceSpectrum vec3
// A function from Wavelength to SpectralRadianceDensity.
#define RadianceDensitySpectrum vec3
// A function from Wavelength to ScaterringCoefficient.
#define ScatteringSpectrum vec3

// A position in 3D (3 length values).
#define Position vec3
// A unit direction vector in 3D (3 unitless values).
#define Direction vec3

#define TransmittanceTexture sampler2D
#define AbstractScatteringTexture sampler3D
#define ReducedScatteringTexture sampler3D
#define ScatteringTexture sampler3D
#define ScatteringDensityTexture sampler3D
#define IrradianceTexture sampler2D

const Length m = 1.0;//��
const Wavelength nm = 1.0;//����
const Angle rad = 1.0;//����
const SolidAngle sr = 1.0;//���廡��
const Power watt = 1.0;//����

const float PI = 3.14159265358979323846;

const Length km = 1000.0 * m;
const Area m2 = m * m;
const Volume m3 = m * m * m;
const Angle pi = PI * rad;
const Angle deg = pi / 180.0;
const Irradiance watt_per_square_meter = watt / m2;
const Radiance watt_per_square_meter_per_sr = watt / (m2 * sr);
const SpectralIrradiance watt_per_square_meter_per_nm = watt / (m2 * nm);
const SpectralRadiance watt_per_square_meter_per_sr_per_nm =
    watt / (m2 * sr * nm);
const SpectralRadianceDensity watt_per_cubic_meter_per_sr_per_nm =
    watt / (m3 * sr * nm);

struct DensityProfileLayer {//�������ܶ�����
	Length width;
	Number exp_term;
	InverseLength exp_scale;
	InverseLength linear_term;
	Number constant_term;
};

struct DensityProfile {
	DensityProfileLayer layers[2];
};

struct AtmosphereParameters {//���������ģ��
	// �����㶥����̫�����ն�
	IrradianceSpectrum solar_irradiance;
	// ̫���ǰ뾶
  	Angle sun_angular_radius;
  	// �������ĵ�������ײ��ľ���,������뾶
  	Length bottom_radius;
  	// �������ĵ������㶥���ľ���
  	Length top_radius;
  	// �������ӵ��ܶȷֲ�,[0,1]
  	DensityProfile rayleigh_density;
  	// ����Ϊh����rayleighɢ��ϵ�� = rayleigh_scattering * rayleigh_density
  	ScatteringSpectrum rayleigh_scattering;
  	// ���ܽ����ܶ�����,[0,1]
  	DensityProfile mie_density;
	// mieɢ��ϵ�� = mie_scattering * mie_density
  	ScatteringSpectrum mie_scattering;
  	// ���ܽ�������ϵ�� = mie_extinction * mie_density
  	ScatteringSpectrum mie_extinction;
  	// ���ܽ���Cornette-Shanks��λ�����еķǶԳƲ���
  	Number mie_phase_function_g;
  	// ���չ��ߵĿ������ӵ��ܶȷֲ�,[0,1]
  	DensityProfile absorption_density;
  	// ���չ��ߵĿ�������ϵ�� = absorption_extinction * absorption_density
  	ScatteringSpectrum absorption_extinction;
  	// �����ƽ��������(����ϵ��)
  	DimensionlessSpectrum ground_albedo;
  	// ̫��������춥�ǵ�cosֵ(cos�����С)�����ں������ɢ���Ԥ����
  	Number mu_s_min;
};
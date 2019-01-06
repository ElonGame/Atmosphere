/*
The functions provided in this file are organized as follows:
Transmittance
    Computation
    Precomputation
    Lookup
Single scattering
    Computation
    Precomputation
    Lookup
Multiple scattering
    Computation
    Precomputation
    Lookup
Ground irradiance
    Computation
    Precomputation
    Lookup
Rendering
    Sky
    Aerial perspective
    Ground
*/

/**
 * ���¼���clamp��������������ֵ�����Ӧ����ֵ����
 */

Number ClampCosine(Number mu){
	return(clamp(mu, Number(-1.0), Number(1.0)));
}


Length ClampDistance(Length d){
	return(max(d, 0.0 * m));
}


Length ClampRadius( IN(AtmosphereParameters)atmosphere, Length r ){
	return(clamp( r, atmosphere.bottom_radius, atmosphere.top_radius ) );
}


Length SafeSqrt( Area a ){
	return(sqrt( max( a, 0.0 * m2 ) ) );
}

/**
 * ����:
 *  �������ʽ����Ԫһ�η���x^2+2urx+r^2-t^2=0
 *  ����u(�������mu)�������춥�ǵ�cosֵ,��t(�������top_radius)�Ǵ����������뾶
 *  r���ӵ�λ��������z����,���ĸ����ӵ�p�����ߵ������㶥��ľ���
 * ���������
 *  atmosphere����ģ�Ͳ���(����top_radiusҪ�õ�),rΪ�ӵ�߶�,mu�������춥�ǵ�cosֵ
 **/
Length DistanceToTopAtmosphereBoundary( IN(AtmosphereParameters)atmosphere,
					Length r, Number mu ){
	Area discriminant = r*r*(mu*mu-1.0)+atmosphere.top_radius*atmosphere.top_radius;//�б�ʽ
	return(ClampDistance( -r * mu + SafeSqrt( discriminant ) ) ); /* �����Ƿ��̽���"+"���Ǹ��� */
}

/**
 * ����:
 *  �뺯��DistanceToTopAtmosphereBoundary����
 *  ���������������ӵ������߷��򵽵�����潻��ľ���
 * ���������
 *  atmosphere����ģ�Ͳ���(����top_radiusҪ�õ�),rΪ�ӵ�߶�,mu�������춥�ǵ�cosֵ
 **/
Length DistanceToBottomAtmosphereBoundary( IN(AtmosphereParameters)atmosphere,
					   Length r, Number mu ){
	Area discriminant = r*r*(mu*mu-1.0)+atmosphere.bottom_radius*atmosphere.bottom_radius;
	return(ClampDistance( -r * mu - SafeSqrt( discriminant ) ) ); /* �����Ƿ��̽���"-"���Ǹ��� */
}

/**
 * ����:
 *  ��iΪ�ӵ������߷�����������Ľ���,�ӵ�����Ϊp
 *  �򵱶�Ԫһ�η���d^2+2rud+r^2-t^2=0�н�d>=0ʱ,����pi������н���
 *  �÷�������ǰ���Ѿ�˵��,����Ǿ���,������һ��>=0,��ֻ��÷����н⣬��ô���н���
 *  ��������ж�ͨ�����̵��б�ʽ�жϷ����Ƿ��н�
 * ���������
 *  atmosphere����ģ�Ͳ���(����top_radiusҪ�õ�),rΪ�ӵ�߶�,mu�������춥�ǵ�cosֵ
 **/
bool RayIntersectsGround( IN(AtmosphereParameters)atmosphere,
			  Length r, Number mu ){
	// �춥�Ǵ���90��(cosֵ<0) �� �б�ʽ>=0
	return(mu < 0.0 && r * r * (mu * mu - 1.0) +
	       atmosphere.bottom_radius * atmosphere.bottom_radius >= 0.0 * m2);
}

/**
 * ����:
 *  ���ݸ����߶ȼ����ܶ�,�ܶ�='exp_term'*exp('exp_scale' * h)+'linear_term'*h+'constant_term'
 * ���������
 *  layer������,altitudeΪ���θ߶�
 **/
Number GetLayerDensity( IN(DensityProfileLayer)layer, Length altitude ){
	/* �ܶȼ���'exp_term' * exp('exp_scale' * h) + 'linear_term' * h + 'constant_term' */
	Number density = layer.exp_term * exp( layer.exp_scale * altitude ) +
			 layer.linear_term * altitude + layer.constant_term;
	return(clamp( density, Number( 0.0 ), Number( 1.0 ) ) );
}

/**
 * ����:
 *  ���ݸ������θ߶ȣ�������Ӧ���ܶ�ֵ��������������ܶ�ģ��������
 * ���������
 *  profileΪ������,altitudeΪ���θ߶�
 **/
Number GetProfileDensity( IN(DensityProfile)profile, Length altitude ){
	return(altitude < profile.layers[0].width ?
	       GetLayerDensity( profile.layers[0], altitude ) :
	       GetLayerDensity( profile.layers[1], altitude ) );
}

/**
 * ����:
 *  ���ݶȷ��͹��߲�����(Ray Marching)�����p�������㶥���Ĺ�ѧ����
 * ���������
 *  atmosphereΪ����ģ��,profileΪ��Ӧ���ܶȷֲ�,rΪ�ӵ�߶�,mu�������춥�ǵ�cosֵ
 **/
Length ComputeOpticalLengthToTopAtmosphereBoundary(
	IN(AtmosphereParameters)atmosphere, IN(DensityProfile)profile,
	Length r, Number mu ){
	/* ȡ500���������л��� */
	const int SAMPLE_COUNT = 500;
	/* �������䲽�� */
	Length dx = DistanceToTopAtmosphereBoundary(atmosphere,r,mu)/Number(SAMPLE_COUNT);
	/* ���ݶȷ�ѭ��������л��� */
	Length result = 0.0 * m;
	for ( int i = 0; i <= SAMPLE_COUNT; ++i) {
		Length d_i = Number( i ) * dx;
		/* ��ǰ�����㵽�������ĵľ��� */
		Length r_i = sqrt( d_i * d_i + 2.0 * r * mu * d_i + r * r );
		/* ��ȡ��ǰ��������ܶ�ֵ,ע�⴫����Ǻ��θ߶� */
		Number y_i = GetProfileDensity( profile, r_i - atmosphere.bottom_radius );
		/* (�����ݶȼ��㷨��,�ڻ��ֶ�����ȡ0.5��Ȩֵ������Ϊ1.0 */
		Number weight_i = i == 0 || i == SAMPLE_COUNT ? 0.5 : 1.0;
		result += y_i * weight_i * dx;
	}
	return result;
}

/**
 * ����:
 *  �����ӵ������߷���������㶥�������͸����(��ƹ�ѧ���)
 *  ���Ϊ�����ֵ���ȡ����expֵ:rayleigh��ѧ����+mie��ѧ����+���չ��߷��ӵĹ�ѧ����
 *  ��Ӧ�Ľ��ʷֱ�Ϊ:�������ӡ����ܽ������չ��ߵĽ���
 * ���������
 *  atmosphereΪ����ģ��,rΪ�ӵ�߶�,mu�������춥�ǵ�cosֵ
 **/
DimensionlessSpectrum ComputeTransmittanceToTopAtmosphereBoundary(
	IN(AtmosphereParameters)atmosphere, Length r, Number mu ){
	return(exp( -(
			    atmosphere.rayleigh_scattering *
			    ComputeOpticalLengthToTopAtmosphereBoundary(
				    atmosphere, atmosphere.rayleigh_density, r, mu ) +
			    atmosphere.mie_extinction *
			    ComputeOpticalLengthToTopAtmosphereBoundary(
				    atmosphere, atmosphere.mie_density, r, mu ) +
			    atmosphere.absorption_extinction *
			    ComputeOpticalLengthToTopAtmosphereBoundary(
				    atmosphere, atmosphere.absorption_density, r, mu ) ) ) );
}

/**
 * ����:
 *  ��[0,1]��xӳ�䵽[0.5/n,1.0-0.5/n],����n�������С
 *  ԭ���Ƿ�ֹ������߽粿�ֲ�������һЩ����ֵ
 * ���������
 *  xҪӳ���ֵ,texture_size�����С
 **/
Number GetTextureCoordFromUnitRange( Number x, int texture_size ){
	return(0.5 / Number( texture_size ) + x * (1.0 - 1.0 / Number( texture_size ) ) );
}

/**
 * ����:
 *  GetTextureCoordFromUnitRange�������
 * ���������
 *  uҪӳ���ֵ,texture_size�����С
 **/
Number GetUnitRangeFromTextureCoord( Number u, int texture_size ){
	return( (u - 0.5 / Number( texture_size ) ) / (1.0 - 1.0 / Number( texture_size ) ) );
}

/**
 * ����:
 *  ��(r,mu)ͨ����ϣ����ӳ�䵽��������(u,v)
 * ���������
 *  atmosphere����ģ�Ͳ���,rΪ�ӵ�߶�,mu�������춥�ǵ�cosֵ
 **/
vec2 GetTransmittanceTextureUvFromRMu(IN(AtmosphereParameters)atmosphere,
				       Length r, Number mu){
	/* �ر���������������㶥���Ľ��������ߵ����֮��ľ��� */
	Length H = sqrt( atmosphere.top_radius * atmosphere.top_radius -
			 atmosphere.bottom_radius * atmosphere.bottom_radius );
	/* ���ӵ�ĵر����ߵ��е㵽�ӵ�ľ��� */
	Length rho = SafeSqrt(r*r-atmosphere.bottom_radius*atmosphere.bottom_radius);
	/* dΪ�ӵ������߷�������������Ľ���ľ���,��������d���Ͻ硢�½�*/
	Length	d		= DistanceToTopAtmosphereBoundary( atmosphere, r, mu );
	Length	d_min	= atmosphere.top_radius - r;// �½����ӵ㵽������Ĵ�ֱ����
	Length	d_max	= rho + H; // �Ͻ����������߸պ���ر�����
	Number	x_mu	= (d - d_min) / (d_max - d_min); // ��muӳ�䵽[0,1]
	Number	x_r		= rho / H; 
	return vec2(GetTextureCoordFromUnitRange(x_mu, TRANSMITTANCE_TEXTURE_WIDTH),
		     	  GetTextureCoordFromUnitRange(x_r, TRANSMITTANCE_TEXTURE_HEIGHT));
}

/**
 * ����:
 *  ��(u,v)ӳ�䵽��������(r,mu),�����溯���������
 * ���������
 *  atmosphere����ģ�Ͳ���,rΪ�ӵ�߶�,mu�������춥�ǵ�cosֵ,uv��Ҫ�任����������
 **/
void GetRMuFromTransmittanceTextureUv( IN(AtmosphereParameters)atmosphere,
				       IN(vec2)uv, OUT(Length)r, OUT(Number)mu ){
	/* �任���� */
	Number	x_mu	= GetUnitRangeFromTextureCoord(uv.x, TRANSMITTANCE_TEXTURE_WIDTH);
	Number	x_r		= GetUnitRangeFromTextureCoord(uv.y, TRANSMITTANCE_TEXTURE_HEIGHT);
	/* �ر���������������㶥���Ľ��������ߵ����֮��ľ��� */
	Length H = sqrt(atmosphere.top_radius * atmosphere.top_radius -
			 		   atmosphere.bottom_radius * atmosphere.bottom_radius);
	/* ���ӵ�ĵر����ߵ��е㵽�ӵ�ľ���,���ڼ���r(�����ι��ɶ���) */
	Length rho = H * x_r;
	r = sqrt(rho * rho + atmosphere.bottom_radius * atmosphere.bottom_radius);
	/* dΪ�ӵ������߷�������������Ľ���ľ���,�������d���ϡ��½�,�Ӷ��ó�d */
	Length	d_min	= atmosphere.top_radius - r;
	Length	d_max	= rho + H;
	Length	d		= d_min + x_mu * (d_max - d_min);
   // ����H��rho��d�Ƴ������춥��cosֵ����ǰ���ᵽ����d����d^2+2rud+r^2-t^2=0�Ƴ����е�u
	mu	= d == 0.0 * m ? Number(1.0) : (H * H - rho * rho - d * d) / (2.0 * r * d);
	mu	= ClampCosine(mu);
}

/**
 * ����:
 *  ���������������(u,v)ӳ���(r,mu),Ȼ��(r,mu)���ڼ����ѧ���
 * ���������
 *  atmosphere��������ģ��,frag_coordΪ��ǰ��ƬԪ����
 **/
DimensionlessSpectrum ComputeTransmittanceToTopAtmosphereBoundaryTexture(
	IN(AtmosphereParameters)atmosphere, IN(vec2)frag_coord ){
	const vec2 TRANSMITTANCE_TEXTURE_SIZE =
				vec2(TRANSMITTANCE_TEXTURE_WIDTH, TRANSMITTANCE_TEXTURE_HEIGHT);
	Length	r;/* rΪ�ӵ�߶�,mu�������춥�ǵ�cosֵ */
	Number	mu;
	GetRMuFromTransmittanceTextureUv(atmosphere, 
						frag_coord/TRANSMITTANCE_TEXTURE_SIZE, r, mu );
	return	ComputeTransmittanceToTopAtmosphereBoundary(atmosphere, r, mu);
}

/**
 * ����:
 *  ��(r,mu)ӳ�䵽��������(u,v),Ȼ�����(u,v)��ȡ��Ӧ����Ԫ�洢�Ĺ�ѧ���
 *  ����(r,mu)ȥ����Ԥ�����ŵ�����,������Ӧ��Ԫ��ֵ
 * ���������
 *  atmosphere��������ģ��,transmittance_texture͸��������,
 *  rΪ�ӵ�߶�,mu�����߷����춥�ǵ�cosֵ
 **/
DimensionlessSpectrum GetTransmittanceToTopAtmosphereBoundary(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	Length r, Number mu){
	vec2 uv = GetTransmittanceTextureUvFromRMu(atmosphere, r, mu);
	return DimensionlessSpectrum(texture(transmittance_texture, uv));
}

/**
 * ����:
 *  �����ӵ�p����ӵ㴥�������߳���Ϊd�ĵ�q֮��Ĺ�ѧ���
 *  pq��ѧ���=pi��ѧ���/qi��ѧ���,i��p���������������Ľ���
 * ���������
 *  atmosphere��������ģ��,transmittance_texture��ѧ�������,rΪ�ӵ�p�߶�
 *  ,mu�������춥�ǵ�cosֵ,d������pq�ĳ���,ray_r_mu_intersects_ground�����Ƿ�������ཻ
 **/
DimensionlessSpectrum GetTransmittance(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	Length r, Number mu, Length d, bool ray_r_mu_intersects_ground){
	/* �����q���ĸ߶����춥��cosֵ */
	Length	r_d		= ClampRadius(atmosphere, sqrt(d * d + 2.0 * r * mu * d + r * r));
	Number	mu_d	= ClampCosine((r * mu + d) / r_d);// oq������pi���������������������֮��

	/* �������pi������н���,ȡ������춥�� */
	if ( ray_r_mu_intersects_ground ){
		return min(
			       GetTransmittanceToTopAtmosphereBoundary(
				       atmosphere, transmittance_texture, r_d, -mu_d ) /
			       GetTransmittanceToTopAtmosphereBoundary(
				       atmosphere, transmittance_texture, r, -mu ),
			       DimensionlessSpectrum(1.0));
	} else {
		return min(
			       GetTransmittanceToTopAtmosphereBoundary(
				       atmosphere, transmittance_texture, r, mu ) /
			       GetTransmittanceToTopAtmosphereBoundary(
				       atmosphere, transmittance_texture, r_d, mu_d ),
			       DimensionlessSpectrum(1.0));
	}
}

/**
 * ����:
 *  ����ĳһ�㵽̫���Ĺ�ѧ
 * ���������
 *  atmosphere��������ģ��,transmittance_texture͸��������,rΪ�ӵ�p���θ߶�
 *  ,mu_s��������̫���нǵ�cosֵ
 **/
DimensionlessSpectrum GetTransmittanceToSun(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	Length r, Number mu_s ){
	/* ������ӵ�p�ĵ����������ߵ��춥�ǵ�sin��cosֵ */
	Number	sin_theta_h	= atmosphere.bottom_radius / r;
	Number	cos_theta_h	= -sqrt(max(1.0-sin_theta_h*sin_theta_h, 0.0));//ȡ������Ϊthetaһ�����ڵ���90��
	/* ��̫����͸����=��ѧ����*̫���ڵ�ƽ�����ϲ��ֵ����򲿷� */
	return(GetTransmittanceToTopAtmosphereBoundary(
		       atmosphere, transmittance_texture, r, mu_s ) *
	       smoothstep(-sin_theta_h * atmosphere.sun_angular_radius/rad,// radΪ���ȵ�λ
			   			  sin_theta_h * atmosphere.sun_angular_radius/rad,
			   			  mu_s-cos_theta_h));
}

/**
 * ����:
 *  ���㵥��ɢ�����,����rayleighɢ��ϵ����mieɢ��ϵ������ֵ,����ѧ���(���ǹ�ѧ����)
 * ���������
 *  atmosphere��������ģ��,transmittance_texture��ѧ��������,rΪ�ӵ�p�߶�
 *  muΪ�����춥��cosֵ,mu_s��̫�������춥�ǵ�cosֵ,dΪ�ӵ�p�����߷�����q�ľ���,
 *  nu��������̫����λ���������ļн�cosֵ,ray_r_mu_intersects_ground�����Ƿ�������ཻ
 **/
void ComputeSingleScatteringIntegrand(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	Length r, Number mu, Number mu_s, Number nu, Length d,
	bool ray_r_mu_intersects_ground,
	OUT(DimensionlessSpectrum)rayleigh, OUT(DimensionlessSpectrum)mie ){
	/* ��qΪ����pi�ϵ�һ��,r_dΪq�ĺ��θ߶� */
	Length r_d 	 = ClampRadius( atmosphere, sqrt( d * d + 2.0 * r * mu * d + r * r ) );
	/* mu_s_dΪ����0q��̫����λ���������ļнǵ�cosֵ */
	Number mu_s_d = ClampCosine( (r * mu_s + d * nu) / r_d );
	/* �������ΪGetTransmittance���ص���exp,��˼����ǵ�ָ����� */
	DimensionlessSpectrum transmittance =
		GetTransmittance(atmosphere, transmittance_texture, r, mu, d,ray_r_mu_intersects_ground) *
		GetTransmittanceToSun(atmosphere, transmittance_texture, r_d, mu_s_d);
	rayleigh = transmittance * GetProfileDensity(
		atmosphere.rayleigh_density, r_d - atmosphere.bottom_radius);
	mie 	  = transmittance * GetProfileDensity(
		atmosphere.mie_density, r_d - atmosphere.bottom_radius);
}

/**
 * ����:
 *  ��������(r,mu)��������߽�����ľ���
 * ���������
 *  atmosphere��������ģ��,rΪ�ӵ�p�߶�,muΪ�����춥��cosֵ,
 *	 ray_r_mu_intersects_ground�����Ƿ�������ཻ
 **/
Length DistanceToNearestAtmosphereBoundary( IN(AtmosphereParameters)atmosphere,
					    Length r, Number mu, bool ray_r_mu_intersects_ground ){
	/* ������������н���,������㵽�������ľ��� */
	if ( ray_r_mu_intersects_ground ){
		return DistanceToBottomAtmosphereBoundary(atmosphere, r, mu);
	}else{ /* ���򷵻ص������㶥���ľ��� */
		return DistanceToTopAtmosphereBoundary( atmosphere, r, mu);
	}
}

/**
 * ����:
 *  ���ݶȷ��͹��߲������㵥����ɢ�����
 * ���������
 *  atmosphere��������ģ��,transmittance_texture��ѧ��������,rΪ�ӵ�p�߶�
 *  muΪ�����춥��cosֵ,mu_s��̫�������춥�ǵ�cosֵ,
 *  nu������pq��̫����λ���������ļн�cosֵ,ray_r_mu_intersects_ground�����Ƿ�������ཻ
 **/
void ComputeSingleScattering(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	Length r, Number mu, Number mu_s, Number nu,
	bool ray_r_mu_intersects_ground,
	OUT(IrradianceSpectrum)rayleigh, OUT(IrradianceSpectrum)mie ){
	/* ��ֵ���ֲ������� */
	const int SAMPLE_COUNT = 50;
	/* ���ֲ���,ȡһ������Ľ�����Ϊ�����յ�,������������� */
	Length dx =
		DistanceToNearestAtmosphereBoundary(atmosphere, r, mu,
						     ray_r_mu_intersects_ground)/Number( SAMPLE_COUNT);
	DimensionlessSpectrum	rayleigh_sum	= DimensionlessSpectrum(0.0);
	DimensionlessSpectrum	mie_sum		= DimensionlessSpectrum(0.0);
	for ( int i = 0; i <= SAMPLE_COUNT; ++i ){
		Length d_i = Number(i)*dx;
		/* ��ǰ���rayleighɢ��ϵ����mieɢ��ϵ��. */
		DimensionlessSpectrum	rayleigh_i;
		DimensionlessSpectrum	mie_i;
		ComputeSingleScatteringIntegrand(atmosphere, transmittance_texture,
						  r, mu, mu_s, nu, d_i, ray_r_mu_intersects_ground, rayleigh_i, mie_i);
		Number weight_i = (i == 0 || i == SAMPLE_COUNT) ? 0.5 : 1.0;
		rayleigh_sum	  += rayleigh_i * weight_i;
		mie_sum		  += mie_i * weight_i;
	}
	// ��ʱ��δ������λ����,Ϊ�˼��ټ�����,��Ϊ�Ǿ��Ȳ���,���Խ�dx�ŵ���ѭ��ȥ
	rayleigh = rayleigh_sum * dx * atmosphere.solar_irradiance * atmosphere.rayleigh_scattering;
	mie 	  = mie_sum * dx * atmosphere.solar_irradiance * atmosphere.mie_scattering;
}

/**
 * ����:
 *  ����rayleigh��λ����
 * ���������
 *  nu������pq��̫����λ���������ļн�cosֵ
 **/
InverseSolidAngle RayleighPhaseFunction(Number nu){
	InverseSolidAngle k = 3.0 / (16.0 * PI * sr);// srΪ����ǵ�λ
	return(k * (1.0 + nu * nu) );
}


/**
 * ����:
 *  ����mie��λ����
 * ���������
 *  nu������pq��̫����λ���������ļн�cosֵ,g��ɢ��ĶԳ�������
 *  gΪ������ʾ���ߴ�������ɢ��,Ϊ����˵������Ĺ�����ǰ��ɢ��
 **/
InverseSolidAngle MiePhaseFunction( Number g, Number nu ){
	InverseSolidAngle k = 3.0 / (8.0 * PI * sr) * (1.0 - g * g) / (2.0 + g * g);
	return(k * (1.0 + nu * nu) / pow( 1.0 + g * g - 2.0 * g * nu, 1.5 ) );
}

/**
 * ����:
 *  ������ɢ�������Ҫ���ĸ�����(r,mu,mu_s,nu)ӳ�䵽��������(u,v,w,z)
 * ���������
 *  atmosphere��������ģ��,rΪ�ӵ�p�߶�,muΪ�����춥��cosֵ,
 *  mu_s��̫�������춥�ǵ�cosֵ,nu������pq��̫����λ���������ļн�cosֵ,
 *  ray_r_mu_intersects_ground�����Ƿ�������ཻ
 **/
vec4 GetScatteringTextureUvwzFromRMuMuSNu( IN(AtmosphereParameters)atmosphere,
					   Length r, Number mu, Number mu_s, Number nu,
					   bool ray_r_mu_intersects_ground ){
	/* ���ӵ����ر����е����ߵ��е㵽��������ľ��� */
	Length H = sqrt( atmosphere.top_radius * atmosphere.top_radius -
			 			atmosphere.bottom_radius * atmosphere.bottom_radius );
	/* �ӵ�p�������ߵ���ر����е����ߵ��е�ľ��� */
	Length rho =
			SafeSqrt( r * r - atmosphere.bottom_radius * atmosphere.bottom_radius );
	Number u_r = GetTextureCoordFromUnitRange(rho/H, SCATTERING_TEXTURE_R_SIZE);

	/* ��Ԫһ�η����б�ʽ,���ڶ�Ԫһ�η��������ʽ(�������(r,mu)��ر�Ľ���) */
	Length	r_mu = r * mu;
	Area	discriminant	=
				r_mu*r_mu - r*r+atmosphere.bottom_radius*atmosphere.bottom_radius;
	Number u_mu;
	/* ������(r,mu)������н��� */
	if ( ray_r_mu_intersects_ground ){
		/* ����(r,mu)��㵽����潻��ľ���d,����������ʽ,�Լ�d���ϡ��½� */
		Length d 		= -r_mu - SafeSqrt(discriminant);
		Length	d_min	= r - atmosphere.bottom_radius;
		Length	d_max	= rho;
		u_mu = 0.5 - 0.5 * GetTextureCoordFromUnitRange(
								 d_max == d_min ? 0.0:(d - d_min) / (d_max - d_min),
								 SCATTERING_TEXTURE_MU_SIZE / 2 );
	} else {
		/* ��������(r,mu)��㵽�����㶥��߽罻��ľ��뼰���Ͻ硢�½� */
		Length	d		= -r_mu + SafeSqrt( discriminant + H * H );
		Length	d_min	= atmosphere.top_radius - r;
		Length	d_max	= rho + H;
		u_mu = 0.5 + 0.5 * GetTextureCoordFromUnitRange(
								(d - d_min) / (d_max - d_min), SCATTERING_TEXTURE_MU_SIZE/2);
	}
	
	/* ����mu_s,���õر�������ͬmu_s�ĵ����ӳ�� */
	Length d 		  = DistanceToTopAtmosphereBoundary(
								atmosphere, atmosphere.bottom_radius, mu_s );
	Length	d_min	  = atmosphere.top_radius-atmosphere.bottom_radius;
	Length	d_max	  = H;
	Number	a		  = (d - d_min) / (d_max - d_min);
	Number	A		  = -2.0*atmosphere.mu_s_min*atmosphere.bottom_radius/(d_max-d_min);
	Number	u_mu_s   = GetTextureCoordFromUnitRange(max(1.0-a/A, 0.0)/(1.0+a),
							  SCATTERING_TEXTURE_MU_S_SIZE);
	Number u_nu = (nu + 1.0) / 2.0; //��nu��[-1,1]ӳ�䵽[0,1]
	return vec4(u_nu, u_mu_s, u_mu, u_r);
}

/**
 * ����:
 *  ����������(u,v,w,z)ӳ�䵽����ɢ�������Ҫ���ĸ�����(r,mu,mu_s,nu)
 * ���������
 *  atmosphere��������ģ��,rΪ�ӵ�p�߶�,muΪ�����춥��cosֵ,uvwz��4D��������
 *  mu_s��̫�������춥�ǵ�cosֵ,nu������pq��̫����λ���������ļн�cosֵ,
 *  ray_r_mu_intersects_ground�����Ƿ�������ཻ
 **/
void GetRMuMuSNuFromScatteringTextureUvwz( IN(AtmosphereParameters)atmosphere,
					   IN(vec4)uvwz, OUT(Length)r, OUT(Number)mu, OUT(Number)mu_s,
					   OUT(Number)nu, OUT(bool)ray_r_mu_intersects_ground ){
	Length H = sqrt(atmosphere.top_radius * atmosphere.top_radius -
			 		   atmosphere.bottom_radius * atmosphere.bottom_radius );
	Length rho = H * GetUnitRangeFromTextureCoord( uvwz.w, SCATTERING_TEXTURE_R_SIZE );
	r = sqrt( rho * rho + atmosphere.bottom_radius * atmosphere.bottom_radius );
	if (uvwz.z < 0.5){
		Length	d_min	= r - atmosphere.bottom_radius;
		Length	d_max	= rho;
		Length	d	= d_min + (d_max - d_min) * GetUnitRangeFromTextureCoord(
						1.0 - 2.0 * uvwz.z, SCATTERING_TEXTURE_MU_SIZE / 2 );
		mu = d == 0.0 * m ? Number( -1.0 ) :
		     			ClampCosine( -(rho * rho + d * d) / (2.0 * r * d) );
		ray_r_mu_intersects_ground = true;
	} else {
		Length	d_min	= atmosphere.top_radius - r;
		Length	d_max	= rho + H;
		Length	d	= d_min + (d_max - d_min) * GetUnitRangeFromTextureCoord(
						2.0 * uvwz.z - 1.0, SCATTERING_TEXTURE_MU_SIZE / 2 );
		mu = d == 0.0 * m ? Number( 1.0 ) :
		     			ClampCosine( (H * H - rho * rho - d * d) / (2.0 * r * d) );
		ray_r_mu_intersects_ground = false;
	}
	Number x_mu_s =
						GetUnitRangeFromTextureCoord(uvwz.y, SCATTERING_TEXTURE_MU_S_SIZE);
	Length	d_min	= atmosphere.top_radius - atmosphere.bottom_radius;
	Length	d_max	= H;
	Number	A	= -2.0 * atmosphere.mu_s_min * atmosphere.bottom_radius / (d_max - d_min);
	Number	a	= (A - x_mu_s * A) / (1.0 + x_mu_s * A);
	Length	d	= d_min + min( a, A ) * (d_max - d_min);
	mu_s = d == 0.0 * m ? Number( 1.0 ) :
	       			ClampCosine( (H * H - d * d) / (2.0 * atmosphere.bottom_radius * d) );
	nu = ClampCosine( uvwz.x * 2.0 - 1.0 );
}

/**
 * ����:
 *  ʵ����ֻ��3D��������,���ｫ3Dת��4D,Ȼ�����4D�����ȡ(r,mu,mu_s,nu)����
 * ���������
 *  atmosphere��������ģ��,rΪ�ӵ�p�߶�,muΪ�����춥��cosֵ,uvwz��4D��������
 *  mu_s��̫�������춥�ǵ�cosֵ,nu������pq��̫����λ���������ļн�cosֵ,
 *  ray_r_mu_intersects_ground�����Ƿ�������ཻ
 **/
void GetRMuMuSNuFromScatteringTextureFragCoord(
	IN(AtmosphereParameters)atmosphere, IN(vec3)frag_coord,
	OUT(Length)r, OUT(Number)mu, OUT(Number)mu_s, OUT(Number)nu,
	OUT(bool)ray_r_mu_intersects_ground ){
	const vec4 SCATTERING_TEXTURE_SIZE = vec4(
						SCATTERING_TEXTURE_NU_SIZE - 1,
						SCATTERING_TEXTURE_MU_S_SIZE,
						SCATTERING_TEXTURE_MU_SIZE,
						SCATTERING_TEXTURE_R_SIZE);
	/* nu��mu_s������ֵ����frag_cood.x��ȡ,ǰ��ȡ��,����ȡģ */
	Number frag_coord_nu =
				floor(frag_coord.x/Number(SCATTERING_TEXTURE_MU_S_SIZE));
	Number frag_coord_mu_s =
				mod(frag_coord.x, Number(SCATTERING_TEXTURE_MU_S_SIZE));
	vec4 uvwz = vec4(frag_coord_nu, frag_coord_mu_s, frag_coord.y, frag_coord.z)/
						SCATTERING_TEXTURE_SIZE;
	/* ����uvwz���4D���������ɢ�������л�ȡ��Ӧ��(r,mu,mu_s,nu) */
	GetRMuMuSNuFromScatteringTextureUvwz(
				atmosphere, uvwz, r, mu, mu_s, nu, ray_r_mu_intersects_ground );
	/* ����nu,���ݸ�����mu��mu_s������һЩ���½�Լ��[cos(x+y),cos(x-y)] */
	nu = clamp(nu, mu * mu_s - sqrt( (1.0 - mu * mu) * (1.0 - mu_s * mu_s) ),
		    			mu * mu_s + sqrt( (1.0 - mu * mu) * (1.0 - mu_s * mu_s)));
}

/**
 * ����:
 *  �������ϵĺ���,�������ǿ��Լ���һ��ָ��������Ԫ��Ӧ�ĵ���ɢ��,�������rayleigh��mie
 * ���������
 *  atmosphere��������ģ��,frag_coordΪ3D��������
 *  ray_r_mu_intersects_ground�����Ƿ�������ཻ
 **/
void ComputeSingleScatteringTexture(IN(AtmosphereParameters)atmosphere,
				     IN(TransmittanceTexture)transmittance_texture, IN(vec3)frag_coord,
				     OUT(IrradianceSpectrum)rayleigh, OUT(IrradianceSpectrum)mie){
	Length	r;
	Number	mu;
	Number	mu_s;
	Number	nu;
	bool	ray_r_mu_intersects_ground;
	GetRMuMuSNuFromScatteringTextureFragCoord(atmosphere, frag_coord,
						   r, mu, mu_s, nu, ray_r_mu_intersects_ground);
	ComputeSingleScattering(atmosphere, transmittance_texture,
				 r, mu, mu_s, nu, ray_r_mu_intersects_ground, rayleigh, mie);
}

/**
 * ����:
 *  ��ȡ��㵽�����������߽罻��֮���ɢ����,��Ҫ����3D���������
 * ���������
 *  atmosphere��������ģ��,scattering_textureΪɢ��Ԥ������,rΪ�ӵ�p���θ߶�,
 *  muΪ�����춥��cosֵ,mu_s��̫�������춥�ǵ�cosֵ,nu������pq��̫����λ���������ļн�cosֵ
 *  ray_r_mu_intersects_ground�����Ƿ�������ཻ
 **/
AbstractSpectrum GetScattering(IN(AtmosphereParameters)atmosphere,
	IN(AbstractScatteringTexture)scattering_texture,
	Length r, Number mu, Number mu_s, Number nu,
	bool ray_r_mu_intersects_ground ){
	/* ���ݸ�����(r,mu,mu_s,nu)�����Ӧ��4D��������uvwz */
	vec4 uvwz = GetScatteringTextureUvwzFromRMuMuSNu(
						atmosphere, r, mu, mu_s, nu, ray_r_mu_intersects_ground );
	Number	tex_coord_x	= uvwz.x * Number(SCATTERING_TEXTURE_NU_SIZE - 1);
	Number	tex_x			= floor(tex_coord_x); /* �������� */
	Number	lerp			= tex_coord_x-tex_x;  /* С������ */
	vec3 uvw0 = vec3((tex_x + uvwz.y) / Number( SCATTERING_TEXTURE_NU_SIZE ),
			  			uvwz.z, uvwz.w);
	vec3 uvw1 = vec3((tex_x + 1.0 + uvwz.y) / Number( SCATTERING_TEXTURE_NU_SIZE ),
			  			uvwz.z, uvwz.w);
	/* ����lerp���Բ�ֵ */
	return AbstractSpectrum(texture(scattering_texture, uvw0) * (1.0 - lerp) +
				 			    texture(scattering_texture, uvw1) * lerp);
}

/**
 * ����:
 *  ��ȡ��㵽�������߽罻��(���������,��ر���)֮���ɢ����ն�,��Ҫ����3D���������
 * ���������
 *  atmosphere��������ģ��,single_rayleigh_scattering_textureΪrayleigh����ɢ������,
 *  single_mie_scattering_textureΪmie����ɢ������,multiple_scattering_texture
 *  rΪ�ӵ�p�߶�,muΪ�����춥��cosֵ,mu_s��̫�������춥�ǵ�cosֵ,
 *  nu������pq��̫����λ���������ļн�cosֵ,ray_r_mu_intersects_ground�����Ƿ�������ཻ
 *  multiple_scattering_textureΪ���ɢ������,scattering_orderΪɢ������
 **/
RadianceSpectrum GetScattering(
    IN(AtmosphereParameters) atmosphere,
    IN(ReducedScatteringTexture) single_rayleigh_scattering_texture,
    IN(ReducedScatteringTexture) single_mie_scattering_texture,
    IN(ScatteringTexture) multiple_scattering_texture,
    Length r, Number mu, Number mu_s, Number nu,
    bool ray_r_mu_intersects_ground,
    int scattering_order) {
	if (scattering_order == 1) {//����ɢ��
		IrradianceSpectrum rayleigh = GetScattering(
        		atmosphere, single_rayleigh_scattering_texture, r, mu, mu_s, nu,
        		ray_r_mu_intersects_ground);
		IrradianceSpectrum mie = GetScattering(
        		atmosphere, single_mie_scattering_texture, r, mu, mu_s, nu,
        		ray_r_mu_intersects_ground);
	 // ���Ҫ������Ӧ����λ����
    return rayleigh * RayleighPhaseFunction(nu) +
        		mie * MiePhaseFunction(atmosphere.mie_phase_function_g, nu);
	} else {//���ɢ��
	return GetScattering(atmosphere, multiple_scattering_texture, r, mu, mu_s, nu,
        						ray_r_mu_intersects_ground);
  }
}

/**
 * ����:
 *  ����n-2��ɢ�������յķ��ն�
 * ���������
 *  atmosphere��������ģ��,irradiance_texture���ն�����,
 *  single_mie_scattering_textureΪmie����ɢ������,multiple_scattering_texture
 *  rΪ�ӵ�p���θ߶�,muΪ�����춥��cosֵ,mu_s��̫�������춥�ǵ�cosֵ,
 **/
IrradianceSpectrum GetIrradiance(IN(AtmosphereParameters)atmosphere,
									   IN(IrradianceTexture)irradiance_texture,
										Length r, Number mu_s);

/**
 * ����:
 *  ����n-1�ص�ɢ����������n�ص�ɢ���ܶ�,���ط����ܶ���
 * ���������
 *  atmosphere��������ģ��,transmittance_textureΪ͸��������,
 *  single_rayleigh_scattering_texture����rayleighɢ������,
 *  single_mie_scattering_textureΪmie����ɢ������,multiple_scattering_texture���ɢ������
 *  irradiance_texture������յķ��ն�����,rΪ���ֵ�p�߶�,muΪ�����춥��cosֵ,
 *  mu_s��̫�������춥�ǵ�cosֵ,nu������pq��̫����λ���������ļн�cosֵ,
 *  scattering_orderɢ�����
 **/
RadianceDensitySpectrum ComputeScatteringDensity(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	IN(ReducedScatteringTexture)single_rayleigh_scattering_texture,
	IN(ReducedScatteringTexture)single_mie_scattering_texture,
	IN(ScatteringTexture)multiple_scattering_texture,
	IN(IrradianceTexture)irradiance_texture,
	Length r, Number mu, Number mu_s, Number nu, int scattering_order ){
	vec3 zenith_direction = vec3(0.0, 0.0, 1.0);
	vec3	omega		= vec3(sqrt(1.0 - mu * mu), 0.0, mu);/* ���߷������� */
	Number	sun_dir_x	= omega.x == 0.0 ? 0.0 : (nu - mu * mu_s) / omega.x;
	Number	sun_dir_y	= sqrt( max( 1.0 - sun_dir_x * sun_dir_x - mu_s * mu_s, 0.0 ) );
	vec3	omega_s	= vec3(sun_dir_x, sun_dir_y, mu_s);/* ̫���������� */
	const int		SAMPLE_COUNT	= 16;//���ֲ�����u
	const Angle		dphi		= pi / Number( SAMPLE_COUNT );//��������
	const Angle		dtheta		= pi / Number( SAMPLE_COUNT );
	RadianceDensitySpectrum rayleigh_mie	=
			RadianceDensitySpectrum( 0.0 * watt_per_cubic_meter_per_sr_per_nm );
	/* ˫�ػ���,thetaΪ�춥�� */
	for (int l = 0; l < SAMPLE_COUNT; ++l){
		Angle	theta		= (Number( l ) + 0.5) * dtheta;
		Number	cos_theta	= cos( theta );
		Number	sin_theta	= sin( theta );
		/* �ж��Ƿ�������н��� */
		bool ray_r_theta_intersects_ground = RayIntersectsGround(atmosphere, r, cos_theta);
		/* ��ǰ���ߵ��ر���ľ����Լ���ѧ��Ƚ�ȡ����theta(���춥��),���Էŵ���ѭ������ */
		Length	distance_to_ground = 0.0 * m;
		DimensionlessSpectrum transmittance_to_ground = DimensionlessSpectrum( 0.0 );
		DimensionlessSpectrum ground_albedo = DimensionlessSpectrum( 0.0 );
		/* ������н��� */
		if (ray_r_theta_intersects_ground){
			/* ��������ߵ�����ľ��� */
			distance_to_ground = DistanceToBottomAtmosphereBoundary(atmosphere, r, cos_theta);
			/* ��Ӧ�ĵ������͸���� */
			transmittance_to_ground =
				GetTransmittance( atmosphere, transmittance_texture, r, cos_theta,
						  distance_to_ground, true /* ray_intersects_ground */ );
			ground_albedo = atmosphere.ground_albedo;/* ���淴���� */
		}
		for ( int m = 0; m < 2 * SAMPLE_COUNT; ++m ){/* ��ѭ������,��������Ƿ�λ�� */
			Angle phi = (Number(m) + 0.5) * dphi;
			/* ��phi(��λ��)��theta(�춥��)�����Ƕ�ָ���ķ������� */
			vec3 omega_i = vec3( cos( phi ) * sin_theta, sin( phi ) * sin_theta, cos_theta );
			/* �����domega=sin(theta)*dtheta*dphi; */
			SolidAngle domega_i = (dtheta / rad) * (dphi / rad) * sin( theta ) * sr;
			/*����n-1�η����omega_i����ķ����L_i��n-1��ɢ���ɢ��ֵ�ۼӡ�
			 * ̫������������omge_i�����нǵ�cosֵ */
			Number nu1 = dot(omega_s, omega_i);
			/* ��ȡn-1ɢ���ڴ˲�������յ�������߷���� */
			RadianceSpectrum incident_radiance = GetScattering(atmosphere,
									    single_rayleigh_scattering_texture, single_mie_scattering_texture,
									    multiple_scattering_texture, r, omega_i.z, mu_s, nu1,
									    ray_r_theta_intersects_ground, scattering_order - 1);
			/* ��������յ������Ĺ���,�ⲿ�ֵ�ֵ��Ҫ���ɲ����㵽����Ĺ�ѧ��ȡ�
			 * ���淴���ʡ������BRDF�Լ��������յ�n-2�η���ķ��նȵĳ˻� */
			vec3 ground_normal = normalize(zenith_direction * r + omega_i * distance_to_ground);
			/* �������յ�n-2�η���ķ��ն� */
			IrradianceSpectrum ground_irradiance = GetIrradiance(
								atmosphere, irradiance_texture, atmosphere.bottom_radius,
								dot(ground_normal, omega_s));
			incident_radiance += transmittance_to_ground *
					     ground_albedo * (1.0 / (PI * sr)) * ground_irradiance;

			/* ��omega_i������-omega����ɢ��ķ����Ϊincident_radiance��
			 * ɢ��ϵ��������omega��omega_i����λ����֮�� */
			Number	nu2			= dot(omega, omega_i);
			Number	rayleigh_density	= GetProfileDensity(
						atmosphere.rayleigh_density, r - atmosphere.bottom_radius );
			Number mie_density = GetProfileDensity(
						atmosphere.mie_density, r - atmosphere.bottom_radius );
			rayleigh_mie += incident_radiance * (
						atmosphere.rayleigh_scattering * rayleigh_density *
						RayleighPhaseFunction( nu2 ) +
						atmosphere.mie_scattering * mie_density *
						MiePhaseFunction( atmosphere.mie_phase_function_g, nu2 ) ) * domega_i;
		}
	}
	return rayleigh_mie;
}

/**
 * ����:
 *  �������ɢ��ϵ��(���ӵ�r������߽�(�������������)�������ɢ�����)
 * ���������
 *  atmosphere��������ģ��,transmittance_textureΪ͸��������,
 *  scattering_density_textureɢ���ܶ�����,
 *  rΪ�ӵ�p�߶�,muΪ�����춥��cosֵ,
 *  mu_s��̫�������춥�ǵ�cosֵ,nu������pq��̫����λ���������ļн�cosֵ,
 *  ray_r_mu_intersects_ground�Ƿ�������ཻ
 **/
RadianceSpectrum ComputeMultipleScattering(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	IN(ScatteringDensityTexture)scattering_density_texture,
	Length r, Number mu, Number mu_s, Number nu,
	bool ray_r_mu_intersects_ground ){
	const int SAMPLE_COUNT = 50; /* ���ֲ����� */
	Length dx =	/* ���ֲ��� */
				DistanceToNearestAtmosphereBoundary(
					atmosphere, r, mu, ray_r_mu_intersects_ground )/Number(SAMPLE_COUNT);
	RadianceSpectrum rayleigh_mie_sum =
				RadianceSpectrum( 0.0 * watt_per_square_meter_per_sr_per_nm );
	for ( int i = 0; i <= SAMPLE_COUNT; ++i ){
		Length d_i = Number( i ) * dx;
		/* ��ǰ�������ֵ�ĸ߶�r_i */
		Length r_i = ClampRadius(atmosphere, sqrt(d_i * d_i + 2.0 * r * mu * d_i + r * r));
		Number	mu_i	= ClampCosine((r * mu + d_i) / r_i);
		Number	mu_s_i	= ClampCosine((r * mu_s + d_i * nu) / r_i);
		/* ��ǰ�������rayleighɢ��ϵ����mieɢ��ϵ�� */
		RadianceSpectrum rayleigh_mie_i =
				GetScattering(
					atmosphere, scattering_density_texture, r_i, mu_i, mu_s_i, nu,
					ray_r_mu_intersects_ground ) *
				GetTransmittance(
					atmosphere, transmittance_texture, r, mu, d_i,
					ray_r_mu_intersects_ground ) * dx;
		Number weight_i = (i == 0 || i == SAMPLE_COUNT) ? 0.5 : 1.0;
		rayleigh_mie_sum += rayleigh_mie_i * weight_i;
	}
	return rayleigh_mie_sum;
}

/**
 * ����:
 *  ���㵱ǰ3D���������Ӧ��(r,mu,mu_s,nu)�����յ�ɢ����ն�
 * ���������
 *  atmosphere��������ģ��,transmittance_textureΪ��ѧ�������,
 *  single_rayleigh_scattering_texture����rayleighɢ������,
 *  single_mie_scattering_textureΪmie����ɢ������,
 *  multiple_scattering_texture���ɢ������
 *  irradiance_texture������յķ��ն�����,frag_coordΪ3D��������,
 *  scattering_orderɢ������
 **/
RadianceDensitySpectrum ComputeScatteringDensityTexture(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	IN(ReducedScatteringTexture)single_rayleigh_scattering_texture,
	IN(ReducedScatteringTexture)single_mie_scattering_texture,
	IN(ScatteringTexture)multiple_scattering_texture,
	IN(IrradianceTexture)irradiance_texture,
	IN(vec3)frag_coord, int scattering_order ){
	Length	r;
	Number	mu;
	Number	mu_s;
	Number	nu;
	bool	ray_r_mu_intersects_ground;
	/* ��frag_coord��3D��������������ǰ��(r,mu,mu_s,nu) */
	GetRMuMuSNuFromScatteringTextureFragCoord( atmosphere, frag_coord,
						   r, mu, mu_s, nu, ray_r_mu_intersects_ground );
	return ComputeScatteringDensity(atmosphere, transmittance_texture,
					 single_rayleigh_scattering_texture, single_mie_scattering_texture,
					 multiple_scattering_texture, irradiance_texture, r, mu, mu_s, nu,
					 scattering_order);
}


/**
 * ����:
 *  ���㵱ǰ3D���������Ӧ��(r,mu,mu_s,nu)���Ķ���ɢ��ϵ��
 *  ���ӵ㵽���������·���ϵĹ�ѧ���
 * ���������
 *  atmosphere��������ģ��,transmittance_textureΪ��ѧ�������,
 *  scattering_density_textureΪɢ��������,frag_coordΪ3D��������,
 *  nuΪ����(r,mu)��̫�����������н�cosֵ
 **/
RadianceSpectrum ComputeMultipleScatteringTexture(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	IN(ScatteringDensityTexture)scattering_density_texture,
	IN(vec3)frag_coord, OUT(Number)nu ){
	Length	r;
	Number	mu;
	Number	mu_s;
	bool	ray_r_mu_intersects_ground;
	/* ��frag_coord��3D��������������ǰ��(r,mu,mu_s,nu) */
	GetRMuMuSNuFromScatteringTextureFragCoord(atmosphere, frag_coord,
						   r, mu, mu_s, nu, ray_r_mu_intersects_ground);
	return ComputeMultipleScattering(atmosphere, transmittance_texture,
					  scattering_density_texture, r, mu, mu_s, nu,
					  ray_r_mu_intersects_ground);
}

/**
 * ����:
 *  ���������յ�ֱ�ӷ��ն�
 * ���������
 *  atmosphere��������ģ��,transmittance_textureΪ��ѧ�������,
 *  scattering_density_textureΪɢ��������,(r,mu_s)Ϊ(�ӵ�߶�,�춥��)
 **/
IrradianceSpectrum ComputeDirectIrradiance(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	Length r, Number mu_s){
	Number alpha_s = atmosphere.sun_angular_radius / rad;//̫���ǰ뾶
	/* ̫��Բ�̿ɼ����ֵĽ���ƽ���������� */
	Number average_cosine_factor = mu_s < -alpha_s ? 0.0 : (mu_s > alpha_s ? mu_s :
					 (mu_s + alpha_s) * (mu_s + alpha_s) / (4.0 * alpha_s) );
	return atmosphere.solar_irradiance *
	       GetTransmittanceToTopAtmosphereBoundary(atmosphere,
				 transmittance_texture, r, mu_s ) * average_cosine_factor;
}

/**
 * ����:
 *  �������ļ�ӷ��ն�,���Ե��淨��Ϊ��İ�����л���
 * ���������
 *  atmosphere��������ģ��,single_rayleigh_scattering_textureΪ����rayleighɢ������,
 *  single_mie_scattering_textureΪ����mieɢ������,
 *  multiple_scattering_texture���ɢ������,
 *  (r,mu_s)Ϊ(���θ߶�,�춥��),scattering_orderɢ�����
 **/
IrradianceSpectrum ComputeIndirectIrradiance(
	IN(AtmosphereParameters)atmosphere,
	IN(ReducedScatteringTexture)single_rayleigh_scattering_texture,
	IN(ReducedScatteringTexture)single_mie_scattering_texture,
	IN(ScatteringTexture)multiple_scattering_texture,
	Length r, Number mu_s, int scattering_order ){
	const int	SAMPLE_COUNT	= 32;/* ���ֲ����� */
	const Angle	dphi		= pi / Number( SAMPLE_COUNT );/* �������� */
	const Angle	dtheta		= pi / Number( SAMPLE_COUNT );

	IrradianceSpectrum result =
			IrradianceSpectrum( 0.0 * watt_per_square_meter_per_nm );
	/* ����(r,mu_s)�ķ������� */
	vec3 omega_s = vec3( sqrt( 1.0 - mu_s * mu_s ), 0.0, mu_s );
	/* �������������˫�ػ��� */
	for ( int j = 0; j < SAMPLE_COUNT / 2; ++j ){//�������2����Ϊֻ�԰������
		Angle theta = (Number( j ) + 0.5) * dtheta;
		for ( int i = 0; i < 2 * SAMPLE_COUNT; ++i ){
			Angle phi = (Number( i ) + 0.5) * dphi;
			vec3 omega = /* (theta,phi)ָ���ķ������� */
				vec3( cos( phi ) * sin( theta ), sin( phi ) * sin( theta ), cos( theta ) );
			/* �����΢Ԫdomega */
			SolidAngle domega = (dtheta / rad) * (dphi / rad) * sin( theta ) * sr;
			/* omega��omega_s�ļн�cosֵ */
			Number nu = dot( omega, omega_s );
			result += GetScattering( atmosphere, single_rayleigh_scattering_texture,
						 single_mie_scattering_texture, multiple_scattering_texture,
						 r, omega.z, mu_s, nu, false /* ray_r_theta_intersects_ground */,
						 scattering_order ) * omega.z * domega;
		}
	}
	return result;
}

/**
 * ����:
 *  ������(r,mu_s)ӳ�䵽(u,v)��������,���ڵ�����յķ��նȵ�Ԥ����
 *  ��Ϊ������նȵļ����������ˮƽ��,���Է��նȼ���������(r,mu_s)
 * ���������
 *  atmosphere��������ģ��, (r,mu_s)Ϊ(�߶�,�춥��)
 **/
vec2 GetIrradianceTextureUvFromRMuS( IN(AtmosphereParameters)atmosphere,
				     Length r, Number mu_s ){
	Number x_r = (r - atmosphere.bottom_radius) /
		     (atmosphere.top_radius - atmosphere.bottom_radius);/* ��rͶӰ��[0,1]֮�� */
	Number x_mu_s = mu_s * 0.5 + 0.5;/* ͬ��mu_s��[-1,1]ͶӰ��[0,1] */
	return(vec2( GetTextureCoordFromUnitRange( x_mu_s, IRRADIANCE_TEXTURE_WIDTH ),
		     GetTextureCoordFromUnitRange( x_r, IRRADIANCE_TEXTURE_HEIGHT ) ) );
}

/**
 * ����:
 *  ����������(u,v)ӳ�䵽����(r,mu_s),GetIrradianceTextureUvFromRMuS�������
 * ���������
 *  atmosphere��������ģ��,uvΪ2D��������,(r,mu_s)Ϊ(�߶�,�춥��)
 **/
void GetRMuSFromIrradianceTextureUv( IN(AtmosphereParameters)atmosphere,
				     IN(vec2)uv, OUT(Length)r, OUT(Number)mu_s ){
	Number	x_mu_s	= GetUnitRangeFromTextureCoord( uv.x, IRRADIANCE_TEXTURE_WIDTH );
	Number	x_r		= GetUnitRangeFromTextureCoord( uv.y, IRRADIANCE_TEXTURE_HEIGHT );
	r = atmosphere.bottom_radius +
	    	x_r * (atmosphere.top_radius - atmosphere.bottom_radius);
	mu_s = ClampCosine( 2.0 * x_mu_s - 1.0 );
}

// ���ն������С
const vec2 IRRADIANCE_TEXTURE_SIZE =
    vec2(IRRADIANCE_TEXTURE_WIDTH, IRRADIANCE_TEXTURE_HEIGHT);

/**
 * ����:
 *  ��������ֱ�Ӵ�̫�����յķ��ն�
 * ���������
 *  atmosphere��������ģ��,transmittance_textureΪ��ѧ�������,
 *  frag_coordΪ2D��������
 **/
IrradianceSpectrum ComputeDirectIrradianceTexture(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	IN(vec2)frag_coord ){
	Length	r;
	Number	mu_s;
	/* ������������frag_coord�����(r,mu_s) */
	GetRMuSFromIrradianceTextureUv(
		atmosphere, frag_coord / IRRADIANCE_TEXTURE_SIZE, r, mu_s );
	/* ���ڼ���ֱ�ӷ��ն� */
	return(ComputeDirectIrradiance( atmosphere, transmittance_texture, r, mu_s ) );
}

/**
 * ����:
 *  �������ļ�ӷ��ն�
 * ���������
 *  atmosphere��������ģ��,single_rayleigh_scattering_texture����rayleighɢ������,
 *  single_mie_scattering_textureΪ����mieɢ������,
 *  multiple_scattering_textureΪ����ɢ������
 *  frag_coordΪ2D��������,scattering_orderΪɢ������
 **/
IrradianceSpectrum ComputeIndirectIrradianceTexture(
	IN(AtmosphereParameters)atmosphere,
	IN(ReducedScatteringTexture)single_rayleigh_scattering_texture,
	IN(ReducedScatteringTexture)single_mie_scattering_texture,
	IN(ScatteringTexture)multiple_scattering_texture,
	IN(vec2)frag_coord, int scattering_order ){
	Length	r;
	Number	mu_s;
	GetRMuSFromIrradianceTextureUv(
			atmosphere, frag_coord / IRRADIANCE_TEXTURE_SIZE, r, mu_s );
	return(ComputeIndirectIrradiance( atmosphere,single_rayleigh_scattering_texture,
					 	single_mie_scattering_texture,multiple_scattering_texture,
						 r, mu_s, scattering_order ) );
}

/**
 * ����:
 *  ͨ���Է��ն��������һ��,��ȡ������ն�ֵ
 * ���������
 *  atmosphere��������ģ��,irradiance_textureΪ���ն�����,
 *  (r,mu_s)Ϊ(�߶�,�춥��)
 **/
IrradianceSpectrum GetIrradiance(
	IN(AtmosphereParameters)atmosphere,
	IN(IrradianceTexture)irradiance_texture,
	Length r, Number mu_s ){
	vec2 uv = GetIrradianceTextureUvFromRMuS(atmosphere, r, mu_s);
	return IrradianceSpectrum(texture( irradiance_texture, uv));
}

/**
 * ����:
 *  �ڽ�rayleigh��mieɢ������ϲ�ʱ,�����Ƴ�mie����ɢ��ֵ
 * ���������
 *  atmosphere��������ģ��,scatteringΪ�ϲ��ĵ���ɢ��ֵ
 **/
#ifdef COMBINED_SCATTERING_TEXTURES
vec3 GetExtrapolatedSingleMieScattering(
	IN(AtmosphereParameters)atmosphere, IN(vec4)scattering ){
	if (scattering.r == 0.0)return vec3(0.0);
	return scattering.rgb * scattering.a/scattering.r *
	      (atmosphere.rayleigh_scattering.r/atmosphere.mie_scattering.r) *
	      (atmosphere.mie_scattering / atmosphere.rayleigh_scattering);
}
#endif

/**
 * ����:
 *  �������л�ȡ��ɢ��ֵ(�ںϲ����������������º���)
 * ���������
 *  atmosphere��������ģ��,scattering_textureɢ������,
 *  single_mie_scattering_textureΪ����mieɢ������,
 *  (r,mu,mu_s,nu)Ϊ(�߶�,�춥��,̫���춥��,����(r,mu)��̫�����������н�cosֵ)
 *  ray_r_mu_intersects_ground�Ƿ�������ཻ,
 *  single_mie_scatteringΪ����mieɢ����ն�
 **/
IrradianceSpectrum GetCombinedScattering(
	IN(AtmosphereParameters)atmosphere,
	IN(ReducedScatteringTexture)scattering_texture,
	IN(ReducedScatteringTexture)single_mie_scattering_texture,
	Length r, Number mu, Number mu_s, Number nu,
	bool ray_r_mu_intersects_ground,
	OUT(IrradianceSpectrum)single_mie_scattering){
	/* ��(nu,mu_s,mu,r)ӳ�䵽��������(u,v,w,z),��ǰ��һ��,��Ҫ��4D��������ӳ�䵽3D */
	vec4 uvwz = GetScatteringTextureUvwzFromRMuMuSNu(
			atmosphere, r, mu, mu_s, nu, ray_r_mu_intersects_ground );
	Number	tex_coord_x	= uvwz.x * Number(SCATTERING_TEXTURE_NU_SIZE - 1);
	Number	tex_x			= floor( tex_coord_x ); /* �������� */
	Number	lerp			= tex_coord_x - tex_x;  /* С������ */
	vec3	uvw0			= vec3( (tex_x + uvwz.y) / Number( SCATTERING_TEXTURE_NU_SIZE ),
									uvwz.z, uvwz.w );
	vec3	uvw1 			= vec3( (tex_x + 1.0 + uvwz.y) / Number( SCATTERING_TEXTURE_NU_SIZE ),
			  						uvwz.z, uvwz.w );
	/* ���ںϲ���һ������ķ���,ֻ����scattering_texture,Ȼ��ֳ����е�mie_scattering */
#ifdef COMBINED_SCATTERING_TEXTURES
	vec4 combined_scattering =
			texture( scattering_texture, uvw0 ) * (1.0 - lerp) +
			texture( scattering_texture, uvw1 ) * lerp;
	IrradianceSpectrum scattering = IrradianceSpectrum( combined_scattering );
	single_mie_scattering =
			GetExtrapolatedSingleMieScattering( atmosphere, combined_scattering );
#else/* �Ǻϲ������,ֱ�Ӳ������Ե����� */
	IrradianceSpectrum scattering = IrradianceSpectrum(
			texture( scattering_texture, uvw0 ) * (1.0 - lerp) +
			texture( scattering_texture, uvw1 ) * lerp );
	single_mie_scattering = IrradianceSpectrum(
			texture( single_mie_scattering_texture, uvw0 ) * (1.0 - lerp) +
			texture( single_mie_scattering_texture, uvw1 ) * lerp );
#endif
	return scattering;
}

/**
 * ����:
 *  ��ȡ��յķ��ն�
 * ���������
 *  atmosphere��������ģ��,transmittance_textureΪ��ѧ�������,scattering_textureɢ������,
 *  single_mie_scattering_textureΪ����mieɢ������,camera�ӵ�λ��,view_ray��������
 *  shadow_length��Ӱ����,����Ӱ���㷨����õ�,sun_direction̫����������,transmittance͸����
 **/
RadianceSpectrum GetSkyRadiance(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	IN(ReducedScatteringTexture)scattering_texture,
	IN(ReducedScatteringTexture)single_mie_scattering_texture,
	Position camera, IN(Direction)view_ray, Length shadow_length,
	IN(Direction)sun_direction, OUT(DimensionlessSpectrum)transmittance){
	Length r = length(camera);/* �ӵ����ڵĸ߶� */
	Length rmu = dot( camera, view_ray );/* r*�춥��cosֵ */
	/* �ӵ������ߵ������㶥��ľ��� */
	Length distance_to_top_atmosphere_boundary = -rmu -
					sqrt( rmu * rmu - r * r + atmosphere.top_radius * atmosphere.top_radius );
	/* ����۲�����̫����������������н���,�ѹ۲����Ƶ�����������㶥�������λ�� */
	if ( distance_to_top_atmosphere_boundary > 0.0 * m ){
		camera	= camera + view_ray * distance_to_top_atmosphere_boundary;
		r	= atmosphere.top_radius;
		rmu	+= distance_to_top_atmosphere_boundary;
	} else if (r > atmosphere.top_radius){
		/* ������������޽���,ֱ�ӷ���0 */
		transmittance = DimensionlessSpectrum( 1.0 );
		return(RadianceSpectrum( 0.0 * watt_per_square_meter_per_sr_per_nm));
	}
	/* ����(r,mu,mu_s,nu)��(�߶�,�춥��cos,̫���춥��cos,̫���������������߼н�cos) */
	Number	mu		= rmu / r;
	Number	mu_s	= dot( camera, sun_direction ) / r;
	Number	nu		= dot( view_ray, sun_direction );
	/* ��������Ƿ�������ཻ */
	bool ray_r_mu_intersects_ground = RayIntersectsGround(atmosphere, r, mu);
	/* ������ཻ���ѧ���Ϊ0 */
	transmittance = ray_r_mu_intersects_ground ? DimensionlessSpectrum( 0.0 ) :
			GetTransmittanceToTopAtmosphereBoundary(atmosphere, transmittance_texture, r, mu );
	IrradianceSpectrum	single_mie_scattering;
	IrradianceSpectrum	scattering;
	if ( shadow_length == 0.0 * m ){/* �������Ҫ�����Ч�� */
		scattering = GetCombinedScattering(
				atmosphere, scattering_texture, single_mie_scattering_texture,
				r, mu, mu_s, nu, ray_r_mu_intersects_ground,single_mie_scattering );
	} else {
		/* ʵ�������Ч��:����ʡȥ������������������߳���Ϊshadow_length����ε�ɢ�����, 
		 * ֻ����ʣ�µ��Ƕ�,�������߳���Ϊd���ĵ㵽�������㽻����һ�� */
		Length	d		= shadow_length;
		Length	r_p		= ClampRadius(atmosphere, sqrt(d*d+2.0*r*mu*d+r*r));
		Number	mu_p	= (r * mu + d) / r_p;
		Number	mu_s_p	= (r * mu_s + d * nu) / r_p;
		scattering 	= GetCombinedScattering(
				atmosphere, scattering_texture, single_mie_scattering_texture,
				r_p, mu_p, mu_s_p, nu, ray_r_mu_intersects_ground,
				single_mie_scattering);
		/* �ӵ�p���������ڳ���shadow_length���ĵ�Ĺ�ѧ��� */
		DimensionlessSpectrum shadow_transmittance =
					GetTransmittance(atmosphere, transmittance_texture,
					  		r, mu, shadow_length, ray_r_mu_intersects_ground);
		scattering = scattering * shadow_transmittance;
		single_mie_scattering = single_mie_scattering * shadow_transmittance;
	}
	return scattering * RayleighPhaseFunction(nu)
		 + single_mie_scattering * MiePhaseFunction(atmosphere.mie_phase_function_g, nu);
}

/**
 * ����:
 *  ��ȡ�ӵ㵽ĳһ��ķ��ն�
 * ���������
 *  atmosphere��������ģ��,transmittance_textureΪ��ѧ�������,scattering_textureɢ������,
 *  single_mie_scattering_textureΪ����mieɢ������,camera�ӵ�λ��,pointĿ��λ��,
 *  shadow_length��Ӱ����,sun_direction̫����������,transmittance��ѧ���
 **/
RadianceSpectrum GetSkyRadianceToPoint(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	IN(ReducedScatteringTexture)scattering_texture,
	IN(ReducedScatteringTexture)single_mie_scattering_texture,
	Position camera, IN(Position)point, Length shadow_length,
	IN(Direction)sun_direction, OUT(DimensionlessSpectrum)transmittance ){
	Direction	view_ray	= normalize( point - camera );/* ���߷������� */
	Length		r			= length(camera);             /* ���θ߶� */
	Length		rmu			= dot(camera, view_ray);      /* r*�춥��cosֵ */
	/* ��������㶥���ľ��� */
	Length distance_to_top_atmosphere_boundary = -rmu -
				sqrt(rmu * rmu - r * r + atmosphere.top_radius * atmosphere.top_radius);
	/* ����ӵ���̫����, ��������������н���,��ô��view���������ƶ��������㶥�� */
	if ( distance_to_top_atmosphere_boundary > 0.0 * m ){
		camera	= camera + view_ray * distance_to_top_atmosphere_boundary;
		r		= atmosphere.top_radius;
		rmu	   += distance_to_top_atmosphere_boundary;
	}
	/* ����(r,mu,mu_s,nu)�������ڵ�һ���������,�õ�camera��������߽����ɢ����� */
	Number	mu		= rmu / r;
	Number	mu_s	= dot(camera, sun_direction)/r;
	Number	nu		= dot(view_ray, sun_direction);
	Length	d		= length(point - camera); /* Ŀ��point��������ľ��� */
	/* ��������Ƿ�������ཻ */
	bool ray_r_mu_intersects_ground = RayIntersectsGround(atmosphere, r, mu);
	/* ��ȡ��camera��point�Ĺ�ѧ���� */
	transmittance = GetTransmittance(atmosphere, transmittance_texture,
					  		r, mu, d, ray_r_mu_intersects_ground);
	/* ��ȡcamera�������߽��rayleigh��ɢ����� */
	IrradianceSpectrum	single_mie_scattering;
	IrradianceSpectrum	scattering = GetCombinedScattering(
			atmosphere, scattering_texture, single_mie_scattering_texture,
			r, mu, mu_s, nu, ray_r_mu_intersects_ground,
			single_mie_scattering);

	/* ����(r,mu,mu_s,nu)���ڵڶ����������,��ȡ��point��������߽����ɢ�����
	 * �����Ҫʵ�������Ч��(shadow_length>0),��ô����Ӧ�ú������߷���ĩ�˵�shadow_length���ȵ�ɢ��
	 * �����d=d-shadow_length*/
	d = max(d - shadow_length, 0.0 * m);
	/* point���߶� */
	Length r_p = ClampRadius(atmosphere, sqrt( d * d + 2.0 * r * mu * d + r * r ));
	Number	mu_p	= (r * mu + d) / r_p;/* point���춥��cos */
	Number	mu_s_p	= (r * mu_s + d * nu) / r_p;/* point��̫�������춥��cos */

	/* ����point�㴦����ɢ������ */
	IrradianceSpectrum	single_mie_scattering_p;
	IrradianceSpectrum	scattering_p = GetCombinedScattering(
			atmosphere, scattering_texture, single_mie_scattering_texture,
			r_p, mu_p, mu_s_p, nu, ray_r_mu_intersects_ground,
			single_mie_scattering_p );
	/* �����ϲ��ҽ���ۺ������õ�camera��point֮���ɢ�� */
	DimensionlessSpectrum shadow_transmittance = transmittance;
	if ( shadow_length > 0.0 * m ){/* Ҫʵ�������Ч�� */
		shadow_transmittance = GetTransmittance( atmosphere, transmittance_texture,
							 		r, mu, d, ray_r_mu_intersects_ground );
	}
	/* camera��point��ɢ��=camera��������߽��scattering-point��������߽��scattering */
	scattering = scattering - shadow_transmittance * scattering_p;
	single_mie_scattering	=
			single_mie_scattering - shadow_transmittance * single_mie_scattering_p;
#ifdef COMBINED_SCATTERING_TEXTURES
	/* ����combined�ķ���,��Ҫ��mie����ɢ���scattering��ȡ���� */
	single_mie_scattering = GetExtrapolatedSingleMieScattering(
				atmosphere, vec4(scattering, single_mie_scattering.r));
#endif
	/* �������ز�ֵ,����̫����ˮƽ������ʱʧ�� */
	single_mie_scattering = single_mie_scattering *
					smoothstep(Number(0.0), Number(0.01), mu_s);
	return scattering * RayleighPhaseFunction(nu) + single_mie_scattering *
	       MiePhaseFunction(atmosphere.mie_phase_function_g, nu);
}

/**
 * ����:
 *  ����ر�ķ��ն�
 * ���������
 *  atmosphere��������ģ��,transmittance_textureΪ��ѧ��������,irradiance_texture���ն�����,
 *  pointĿ��λ��,normal���淨��,sun_direction̫����������,sky_irradiance���s���ն�
 **/
IrradianceSpectrum GetSunAndSkyIrradiance(
	IN(AtmosphereParameters)atmosphere,
	IN(TransmittanceTexture)transmittance_texture,
	IN(IrradianceTexture)irradiance_texture,
	IN(Position)point, IN(Direction)normal, IN(Direction)sun_direction,
	OUT(IrradianceSpectrum)sky_irradiance ){
	Length r = length(point);/* point�㺣�θ߶� */
	Number mu_s = dot(point, sun_direction) / r;/* ��Ӧ���춥�� */
	/* ��ӷ��ն� */
	sky_irradiance = GetIrradiance( atmosphere, irradiance_texture, r, mu_s ) *
			 				(1.0 + dot( normal, point ) / r) * 0.5;
	/* ֱ�ӷ��ն� */
	return atmosphere.solar_irradiance *
	       GetTransmittanceToSun(atmosphere, transmittance_texture, r, mu_s ) *
	       max(dot( normal, sun_direction), 0.0);
}
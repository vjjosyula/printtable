import React, {useEffect, useMemo} from 'react';
import * as THREE from 'three';
import {useFrame, useThree} from '@react-three/fiber';
import {getInputProps, useCurrentFrame} from 'remotion';
import {DepthOfFieldEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect} from 'postprocessing';
import {N8AOPostPass} from 'n8ao';
import {fovFor, offsetAt, viewAt} from './view';
import {C} from '../lib/brand';

/** Positions the camera, fog and post-processing for the current frame and renders. */
export const Rig: React.FC<{dofScale?: number}> = () => {
  const f = useCurrentFrame();
  const {gl, scene, camera, size} = useThree();
  const cam = camera as THREE.PerspectiveCamera;

  const preview = Boolean((getInputProps() as {preview?: boolean}).preview);
  const fx = useMemo(() => {
    const composer = new EffectComposer(gl, {frameBufferType: THREE.HalfFloatType, multisampling: preview ? 0 : 4});
    composer.addPass(new RenderPass(scene, cam));
    const ao = new N8AOPostPass(scene, cam, size.width, size.height);
    ao.configuration.aoRadius = 30;
    ao.configuration.screenSpaceRadius = true;
    ao.configuration.distanceFalloff = 0.35;
    ao.configuration.intensity = 1.4;
    // previews trade a little AO/DOF quality for speed; final renders use full settings
    ao.configuration.aoSamples = preview ? 8 : 16;
    ao.configuration.denoiseSamples = preview ? 4 : 8;
    ao.configuration.halfRes = preview;
    ao.configuration.denoiseRadius = 12;
    ao.configuration.color = new THREE.Color(C.charcoal);
    ao.configuration.gammaCorrection = false;
    composer.addPass(ao);
    const dof = new DepthOfFieldEffect(cam, {worldFocusDistance: 50, worldFocusRange: 40, bokehScale: 2.2, resolutionScale: preview ? 0.5 : 0.75});
    composer.addPass(new EffectPass(cam, dof));
    composer.addPass(new EffectPass(cam, new SMAAEffect()));
    composer.setSize(size.width, size.height);
    return {composer, ao, dof};
  }, [gl, scene, cam, size.width, size.height, preview]);
  useEffect(() => () => fx.composer.dispose(), [fx]);

  useFrame(() => {
    const s = viewAt(f);
    cam.position.copy(s.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(s.target);
    cam.fov = fovFor(size.width / size.height);
    cam.near = s.dist * 0.02;
    cam.far = s.dist * 40;
    // keep subjects below the caption band (top third); centred again for the end card
    // landscape frames need less of a downward shift than the tall social formats
    const offY = offsetAt(f) * (size.width > size.height ? 0.4 : 1);
    cam.setViewOffset(size.width, size.height, 0, -size.height * offY, size.width, size.height);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const fog = scene.fog as THREE.Fog;
    if (fog) {
      fog.near = s.dist * 1.15;
      fog.far = s.dist * 5.5;
      fog.color.set(C.bg);
    }
    {
      // softer ambient occlusion on the dark backdrop so thin processes do not turn charcoal
      fx.ao.configuration.intensity = 1.4;
    }
    fx.dof.cocMaterial.worldFocusDistance = s.dist;
    fx.dof.cocMaterial.worldFocusRange = s.dist * 0.75;
    fx.composer.render();
  }, 1);
  return null;
};

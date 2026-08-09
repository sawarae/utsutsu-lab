import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:vector_math/vector_math_64.dart' hide Colors;
import '../models/character_data.dart';
import '../render/skinning.dart';
import '../render/character_painter.dart';

class AnimatedCharacter extends StatefulWidget {
  final CharacterData characterData;
  final bool isPlaying;
  final double speed;
  final bool debugSkeleton;

  const AnimatedCharacter({
    super.key,
    required this.characterData,
    this.isPlaying = true,
    this.speed = 1.0,
    this.debugSkeleton = false,
  });

  @override
  State<AnimatedCharacter> createState() => _AnimatedCharacterState();
}

class _AnimatedCharacterState extends State<AnimatedCharacter>
    with SingleTickerProviderStateMixin {
  late Ticker _ticker;
  late SkinningEngine _skinning;
  double _elapsedSeconds = 0.0;
  int _currentFrame = 0;
  Map<String, Vector2> _deformedPositions = {};
  Duration? _lastTickTime;

  @override
  void initState() {
    super.initState();
    _skinning = SkinningEngine(widget.characterData.skeleton);
    _updateFrame(0);

    _ticker = createTicker(_onTick);
    if (widget.isPlaying) {
      _ticker.start();
    }
  }

  void _onTick(Duration elapsed) {
    if (!widget.isPlaying) return;

    final dt = _lastTickTime == null
        ? 0.0
        : (elapsed - _lastTickTime!).inMicroseconds / 1e6;
    _lastTickTime = elapsed;

    _elapsedSeconds += dt * widget.speed;

    final bvh = widget.characterData.bvhData;
    final frameTime = bvh.frameTime;
    final totalFrames = bvh.frames.length;

    if (totalFrames == 0) return;

    final newFrame = (_elapsedSeconds / frameTime).floor() % totalFrames;

    if (newFrame != _currentFrame) {
      _updateFrame(newFrame);
    }
  }

  void _updateFrame(int frame) {
    final bvh = widget.characterData.bvhData;
    final skeleton = widget.characterData.skeleton;

    if (bvh.frames.isEmpty) {
      // No animation: show rest pose
      final restPositions = <String, Vector2>{};
      for (final joint in skeleton.joints) {
        restPositions[joint.name] = joint.restPos.clone();
      }
      setState(() {
        _currentFrame = 0;
        _deformedPositions = restPositions;
      });
      return;
    }

    final rotations = bvh.getJointRotations(frame);
    final deformed = skeleton.computeDeformedPositions(rotations);

    setState(() {
      _currentFrame = frame;
      _deformedPositions = deformed;
    });
  }

  @override
  void didUpdateWidget(AnimatedCharacter oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.characterData != widget.characterData) {
      _skinning = SkinningEngine(widget.characterData.skeleton);
      _elapsedSeconds = 0.0;
      _lastTickTime = null;
      _updateFrame(0);
    }

    if (widget.isPlaying && !_ticker.isActive) {
      _lastTickTime = null;
      _ticker.start();
    } else if (!widget.isPlaying && _ticker.isActive) {
      _ticker.stop();
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_deformedPositions.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return CustomPaint(
      painter: CharacterPainter(
        texture: widget.characterData.texture,
        skeleton: widget.characterData.skeleton,
        skinning: _skinning,
        deformedJointPositions: _deformedPositions,
        debugSkeleton: widget.debugSkeleton,
      ),
    );
  }
}

import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:vector_math/vector_math_64.dart' hide Colors;
import '../models/skeleton.dart';
import 'skinning.dart';

class CharacterPainter extends CustomPainter {
  final ui.Image texture;
  final Skeleton skeleton;
  final SkinningEngine skinning;
  final Map<String, Vector2> deformedJointPositions;
  final bool debugSkeleton;

  CharacterPainter({
    required this.texture,
    required this.skeleton,
    required this.skinning,
    required this.deformedJointPositions,
    this.debugSkeleton = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final imgW = skeleton.imageWidth.toDouble();
    final imgH = skeleton.imageHeight.toDouble();

    // Scale to fit canvas while maintaining aspect ratio
    final scaleX = size.width / imgW;
    final scaleY = size.height / imgH;
    final scale = scaleX < scaleY ? scaleX : scaleY;
    final offsetX = (size.width - imgW * scale) / 2;
    final offsetY = (size.height - imgH * scale) / 2;

    canvas.save();
    canvas.translate(offsetX, offsetY);
    canvas.scale(scale);

    // Compute deformed vertex positions
    final deformedPositions = skinning.computeDeformedPositions(
      deformedJointPositions,
    );

    // Build vertex arrays for drawVertices
    final vertexCount = skinning.vertices.length;
    final positions = Float32List(vertexCount * 2);
    final texCoords = Float32List(vertexCount * 2);

    for (int i = 0; i < vertexCount; i++) {
      final deformed = deformedPositions[i];
      positions[i * 2] = deformed.x;
      positions[i * 2 + 1] = deformed.y;

      final uv = skinning.vertices[i].uv;
      texCoords[i * 2] = uv.x * imgW;
      texCoords[i * 2 + 1] = uv.y * imgH;
    }

    final vertices = ui.Vertices.raw(
      ui.VertexMode.triangles,
      positions,
      textureCoordinates: texCoords,
      indices: Uint16List.fromList(skinning.indices),
    );

    // ImageShader matrix: identity (texture coords are in image pixels)
    final matrix = Matrix4.identity().storage;
    final shader = ui.ImageShader(
      texture,
      ui.TileMode.clamp,
      ui.TileMode.clamp,
      Float64List.fromList(matrix),
    );

    final paint = Paint()
      ..shader = shader
      ..blendMode = BlendMode.srcOver;

    canvas.drawVertices(vertices, BlendMode.srcOver, paint);

    if (debugSkeleton) {
      _drawDebugSkeleton(canvas);
    }

    canvas.restore();
  }

  void _drawDebugSkeleton(Canvas canvas) {
    final bonePaint = Paint()
      ..color = Colors.red.withValues(alpha: 0.7)
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke;

    final jointPaint = Paint()
      ..color = Colors.yellow
      ..style = PaintingStyle.fill;

    // Draw bones
    for (final joint in skeleton.joints) {
      if (joint.parent != null) {
        final from = deformedJointPositions[joint.parent!.name];
        final to = deformedJointPositions[joint.name];
        if (from != null && to != null) {
          canvas.drawLine(
            Offset(from.x, from.y),
            Offset(to.x, to.y),
            bonePaint,
          );
        }
      }
    }

    // Draw joints
    for (final joint in skeleton.joints) {
      final pos = deformedJointPositions[joint.name];
      if (pos != null) {
        canvas.drawCircle(Offset(pos.x, pos.y), 4.0, jointPaint);
      }
    }
  }

  @override
  bool shouldRepaint(CharacterPainter oldDelegate) {
    return oldDelegate.deformedJointPositions != deformedJointPositions;
  }
}

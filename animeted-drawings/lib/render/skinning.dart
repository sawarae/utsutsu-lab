import 'package:vector_math/vector_math_64.dart';
import '../models/skeleton.dart';

/// A vertex in the mesh grid
class MeshVertex {
  /// Original UV position in image (0..1 range)
  final Vector2 uv;

  /// Original position in image pixels
  final Vector2 restPos;

  /// Per-joint weights: joint name -> weight (sum to 1.0)
  Map<String, double> weights;

  MeshVertex({required this.uv, required this.restPos, required this.weights});
}

class SkinningEngine {
  /// Grid divisions
  static const int gridCols = 15;
  static const int gridRows = 20;

  final Skeleton skeleton;
  late final List<MeshVertex> vertices;
  late final List<int> indices;

  SkinningEngine(this.skeleton) {
    _buildMesh();
  }

  void _buildMesh() {
    final w = skeleton.imageWidth.toDouble();
    final h = skeleton.imageHeight.toDouble();

    vertices = [];
    for (int row = 0; row <= gridRows; row++) {
      for (int col = 0; col <= gridCols; col++) {
        final u = col / gridCols;
        final v = row / gridRows;
        final px = u * w;
        final py = v * h;

        vertices.add(
          MeshVertex(
            uv: Vector2(u, v),
            restPos: Vector2(px, py),
            weights: _computeWeights(px, py),
          ),
        );
      }
    }

    // Build triangle indices for the grid
    indices = [];
    for (int row = 0; row < gridRows; row++) {
      for (int col = 0; col < gridCols; col++) {
        final tl = row * (gridCols + 1) + col;
        final tr = tl + 1;
        final bl = tl + (gridCols + 1);
        final br = bl + 1;

        // Two triangles per quad
        indices.addAll([tl, tr, bl]);
        indices.addAll([tr, br, bl]);
      }
    }
  }

  Map<String, double> _computeWeights(double px, double py) {
    // Distance-based weighting from each joint
    final point = Vector2(px, py);
    final rawWeights = <String, double>{};

    for (final joint in skeleton.joints) {
      final dist = (joint.restPos - point).length;
      // Inverse distance weighting with falloff
      final influence = 1.0 / (1.0 + dist * dist * 0.001);
      rawWeights[joint.name] = influence;
    }

    // Normalize weights to sum to 1.0
    final total = rawWeights.values.fold(0.0, (a, b) => a + b);
    if (total > 0) {
      return rawWeights.map((k, v) => MapEntry(k, v / total));
    }
    return rawWeights;
  }

  /// Apply Linear Blend Skinning to get deformed vertex positions.
  /// Returns Float32List of [x, y] pairs for each vertex.
  List<Vector2> computeDeformedPositions(
    Map<String, Vector2> deformedJointPositions,
  ) {
    final result = <Vector2>[];

    for (final vertex in vertices) {
      double dx = 0.0;
      double dy = 0.0;

      for (final entry in vertex.weights.entries) {
        final jointName = entry.key;
        final weight = entry.value;

        final restJoint = skeleton.jointMap[jointName];
        final deformedJoint = deformedJointPositions[jointName];

        if (restJoint == null || deformedJoint == null) continue;

        // Displacement from joint's rest position to deformed position
        final dispX = deformedJoint.x - restJoint.restPos.x;
        final dispY = deformedJoint.y - restJoint.restPos.y;

        dx += weight * dispX;
        dy += weight * dispY;
      }

      result.add(Vector2(vertex.restPos.x + dx, vertex.restPos.y + dy));
    }

    return result;
  }
}

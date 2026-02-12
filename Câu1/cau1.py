import heapq
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from typing import Tuple, Dict, List, Optional, Set
import time
import random


class Grid:
    def __init__(self, width: int, height: int, obstacles: Optional[Set[Tuple[int, int]]] = None):
        self.width = width
        self.height = height
        self.obstacles = obstacles if obstacles else set()
    
    def is_walkable(self, x: int, y: int) -> bool:
        """Check if cell is walkable"""
        return 0 <= x < self.width and 0 <= y < self.height and (x, y) not in self.obstacles
    
    def get_neighbors(self, x: int, y: int) -> List[Tuple[int, int]]:
        """Get walkable neighbors (4-directional)"""
        neighbors = []
        for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            nx, ny = x + dx, y + dy
            if self.is_walkable(nx, ny):
                neighbors.append((nx, ny))
        return neighbors
    
    def heuristic(self, pos: Tuple[int, int], goal: Tuple[int, int]) -> int:
        """Manhattan distance heuristic"""
        return abs(pos[0] - goal[0]) + abs(pos[1] - goal[1])


class Pathfinder:
    def __init__(self, grid: Grid):
        self.grid = grid
        self.cache = {}
    
    def find_shortest_path(self, start: Tuple[int, int], goal: Tuple[int, int]) -> Optional[int]:
        """A* pathfinding with bidirectional cache"""
        key = tuple(sorted([start, goal]))
        if key in self.cache:
            return self.cache[key]
        
        if not self.grid.is_walkable(start[0], start[1]) or not self.grid.is_walkable(goal[0], goal[1]):
            return None
        
        if start == goal:
            return 0
        
        pq = []
        visited = set()
        g_score = {start: 0}
        
        h = self.grid.heuristic(start, goal)
        heapq.heappush(pq, (h, 0, start))
        
        while pq:
            f, g, pos = heapq.heappop(pq)
            
            if pos in visited:
                continue
            
            if pos == goal:
                self.cache[key] = g
                return g
            
            visited.add(pos)
            
            for neighbor in self.grid.get_neighbors(pos[0], pos[1]):
                if neighbor in visited:
                    continue
                
                new_g = g + 1
                
                if neighbor not in g_score or new_g < g_score[neighbor]:
                    g_score[neighbor] = new_g
                    h = self.grid.heuristic(neighbor, goal)
                    heapq.heappush(pq, (new_g + h, new_g, neighbor))
        
        return None
    
    def dijkstra_single_source(self, start: Tuple[int, int]) -> Dict[Tuple[int, int], int]:
        """Dijkstra from start to all reachable points"""
        if not self.grid.is_walkable(start[0], start[1]):
            return {}
        
        dist = {start: 0}
        pq = [(0, start)]
        visited = set()
        
        while pq:
            d, pos = heapq.heappop(pq)
            
            if pos in visited:
                continue
            
            visited.add(pos)
            
            for neighbor in self.grid.get_neighbors(pos[0], pos[1]):
                if neighbor in visited:
                    continue
                
                new_d = d + 1
                if neighbor not in dist or new_d < dist[neighbor]:
                    dist[neighbor] = new_d
                    heapq.heappush(pq, (new_d, neighbor))
        
        return dist


class DeliveryProblem:
    
    def __init__(self, start: Tuple[int, int], orders: List[Dict], 
                 gas_stations: List[Tuple[int, int]], max_weight: int, max_fuel: int,
                 grid: Grid, consumption_rate: int = 20):
        self.start = start
        self.orders = orders
        self.gas_stations = gas_stations
        self.max_weight = max_weight
        self.consumption_rate = consumption_rate
        self.max_fuel_units = int(max_fuel * consumption_rate)
        self.grid = grid
        
        self._build_points()
        self.mst_cache = {}
    
    def _build_points(self):
        point_to_idx = {self.start: 0}
        self.points = [self.start]
        
        self.pickup_map = {}
        self.delivery_map = {}
        self.gas_map = {}
        
        for order_id, order in enumerate(self.orders):
            p, d = order['p'], order['d']
            
            if p not in point_to_idx:
                point_to_idx[p] = len(self.points)
                self.points.append(p)
            pickup_idx = point_to_idx[p]
            self.pickup_map[pickup_idx] = order_id
            
            if d not in point_to_idx:
                point_to_idx[d] = len(self.points)
                self.points.append(d)
            delivery_idx = point_to_idx[d]
            self.delivery_map[delivery_idx] = order_id
        
        for gas_id, gas_pos in enumerate(self.gas_stations):
            if gas_pos not in point_to_idx:
                point_to_idx[gas_pos] = len(self.points)
                self.points.append(gas_pos)
            gas_idx = point_to_idx[gas_pos]
            self.gas_map[gas_idx] = gas_id
        
        self.n_points = len(self.points)
        
        pathfinder = Pathfinder(self.grid)
        self.dist = [[float('inf')] * self.n_points for _ in range(self.n_points)]
        
        for i in range(self.n_points):
            distances = pathfinder.dijkstra_single_source(self.points[i])
            self.dist[i][i] = 0
            for j in range(self.n_points):
                if self.points[j] in distances:
                    self.dist[i][j] = distances[self.points[j]]
        
        self._check_connectivity()
        
        self.order_weights = [order['w'] for order in self.orders]
        
        self.order_to_pickup_idx = {}
        self.order_to_delivery_idx = {}
        for idx, order_id in self.pickup_map.items():
            self.order_to_pickup_idx[order_id] = idx
        for idx, order_id in self.delivery_map.items():
            self.order_to_delivery_idx[order_id] = idx
    
    def _check_connectivity(self):
        """Verify all points are reachable from each other"""
        for i in range(self.n_points):
            for j in range(self.n_points):
                if i != j and self.dist[i][j] == float('inf'):
                    raise ValueError(f"Graph not fully connected: {self.points[i]} -> {self.points[j]} unreachable")
    
    def _compute_mst(self, nodes: List[int]) -> int:
        """Compute MST cost using Prim's algorithm"""
        if len(nodes) <= 1:
            return 0
        
        visited = set([nodes[0]])
        mst_cost = 0
        
        while len(visited) < len(nodes):
            min_edge = float('inf')
            next_node = None
            
            for u in visited:
                for v in nodes:
                    if v not in visited and self.dist[u][v] < min_edge:
                        min_edge = self.dist[u][v]
                        next_node = v
            
            if next_node is not None:
                mst_cost += min_edge
                visited.add(next_node)
        
        return mst_cost
    
    def is_complete(self, mask: int) -> bool:
        """Check if all orders are completed"""
        target = (1 << (len(self.orders) * 2)) - 1
        return mask == target
    
    def heuristic(self, pos: int, mask: int) -> int:

        if self.is_complete(mask):
            return self.dist[pos][0]
        
        unfinished = []
        for order_id in range(len(self.orders)):
            pickup_bit = order_id * 2
            delivery_bit = order_id * 2 + 1
            
            if not (mask & (1 << pickup_bit)):
                unfinished.append(self.order_to_pickup_idx[order_id])
            elif not (mask & (1 << delivery_bit)):
                unfinished.append(self.order_to_delivery_idx[order_id])
        
        if not unfinished:
            return self.dist[pos][0]
        
        min_to_unfinished = min(self.dist[pos][u] for u in unfinished)
        
        if min_to_unfinished == float('inf'):
            return float('inf')
        
        if mask in self.mst_cache:
            mst_cost = self.mst_cache[mask]
        else:
            unfinished_with_depot = unfinished + [0]
            mst_cost = self._compute_mst(unfinished_with_depot)
            self.mst_cache[mask] = mst_cost
        
        return min_to_unfinished + mst_cost


class Optimizer:
    
    def __init__(self, problem: DeliveryProblem):
        self.problem = problem
        self.stats = {}
    
    def optimize(self, criterion: str = 'refuel') -> Optional[List]:
        """Optimize route with two-phase approach: minimize refuel then distance"""
        start_time = time.time()
        
        if criterion == 'refuel':
            phase1_result, _ = self._dijkstra_label_setting(self._cost_refuel)
            if not phase1_result:
                return None
            
            min_refuel = phase1_result[4]
            result, prev = self._dijkstra_label_setting(self._cost_distance, min_refuel)
        else:
            result, prev = self._dijkstra_label_setting(self._cost_distance)
        
        if not result:
            return None
        
        path = self._reconstruct_path(result, prev)
        
        elapsed = time.time() - start_time
        self.stats['time'] = elapsed
        print(f"Time: {elapsed:.2f}s | Labels: {self.stats.get('labels', 0)}")
        
        return path
    
    def _is_dominated(self, new_state, new_g, labels, is_phase_refuel):
        """Check if new state is dominated by existing labels (phase-aware)"""
        pos, mask, fuel, load, refuel_cnt = new_state
        key = (pos, mask)
        
        if key not in labels:
            return False
        
        for existing_state, existing_g in labels[key]:
            _, _, ex_fuel, ex_load, ex_refuel = existing_state
            
            # Skip self-check
            if existing_state == new_state and existing_g == new_g:
                continue
            
            if is_phase_refuel:
                if (ex_load <= load and 
                    ex_fuel >= fuel and 
                    ex_refuel <= refuel_cnt and 
                    existing_g <= new_g):
                    return True
            else:
                if (ex_load <= load and 
                    ex_fuel >= fuel and 
                    existing_g <= new_g):
                    return True
        
        return False
    
    def _add_label(self, state, g_cost, labels, is_phase_refuel):
        """Add new label and remove dominated labels (phase-aware)"""
        pos, mask, fuel, load, refuel_cnt = state
        key = (pos, mask)
        
        if key not in labels:
            labels[key] = []
        
        to_remove = []
        for i, (existing_state, existing_g) in enumerate(labels[key]):
            _, _, ex_fuel, ex_load, ex_refuel = existing_state
            
            if is_phase_refuel:
                if (load <= ex_load and 
                    fuel >= ex_fuel and 
                    refuel_cnt <= ex_refuel and 
                    g_cost <= existing_g):
                    to_remove.append(i)
            else:
                if (load <= ex_load and 
                    fuel >= ex_fuel and 
                    g_cost <= existing_g):
                    to_remove.append(i)
        
        for i in reversed(to_remove):
            labels[key].pop(i)
        
        labels[key].append((state, g_cost))
    
    def _dijkstra_label_setting(self, cost_func, max_refuel: Optional[int] = None):
        """A* label-setting with multi-resource dominance"""
        INF = float('inf')
        labels = {}
        pq = []
        prev = {}
        
        is_phase_refuel = (cost_func == self._cost_refuel)
        phase_name = "REFUEL" if is_phase_refuel else "DISTANCE"
        
        init_state = (0, 0, self.problem.max_fuel_units, 0, 0)
        init_g = 0
        init_f = init_g + self.problem.heuristic(0, 0)

        heapq.heappush(pq, (init_f, init_g, init_state))
        self._add_label(init_state, init_g, labels, is_phase_refuel)

        
        target_found = None
        min_cost = INF
        label_count = 0
        explored_count = 0
        
        while pq:
            f_value, g_cost, state = heapq.heappop(pq)

            if f_value >= min_cost:
                break

            pos, mask, fuel, load, refuel_cnt = state

            
            if self._is_dominated(state, g_cost, labels, is_phase_refuel):
                continue
            
            explored_count += 1
            label_count += 1
            
            if self.problem.is_complete(mask) and pos == 0:
                if g_cost < min_cost:
                    min_cost = g_cost
                    target_found = state
                continue
            
            for next_pos in range(self.problem.n_points):
                if next_pos == pos:
                    continue
                
                distance = self.problem.dist[pos][next_pos]
                
                if distance == float('inf'):
                    continue
                
                fuel_needed = distance
                
                if fuel < fuel_needed:
                    continue
                
                new_fuel = fuel - fuel_needed
                new_mask = mask
                new_load = load
                new_refuel = refuel_cnt
                is_refuel = False
                action = None
                
                if next_pos in self.problem.pickup_map:
                    order_id = self.problem.pickup_map[next_pos]
                    if not (mask & (1 << (order_id * 2))) and not (mask & (1 << (order_id * 2 + 1))):
                        order_weight = self.problem.order_weights[order_id]
                        if new_load + order_weight <= self.problem.max_weight:
                            new_mask |= (1 << (order_id * 2))
                            new_load += order_weight
                            action = f"Pickup #{order_id + 1}"
                        else:
                            continue
                    else:
                        continue
                
                elif next_pos in self.problem.delivery_map:
                    order_id = self.problem.delivery_map[next_pos]
                    if (mask & (1 << (order_id * 2))) and not (mask & (1 << (order_id * 2 + 1))):
                        new_mask |= (1 << (order_id * 2 + 1))
                        new_load -= self.problem.order_weights[order_id]
                        action = f"Deliver #{order_id + 1}"
                    else:
                        continue
                
                elif next_pos in self.problem.gas_map:
                    new_fuel = self.problem.max_fuel_units
                    is_refuel = True
                    new_refuel += 1
                    action = "Refuel"
                
                elif next_pos == 0:
                    if new_load == 0:
                        new_fuel = self.problem.max_fuel_units
                        is_refuel = True
                        new_refuel += 1
                        action = "Refuel (Depot)"
                    else:
                        continue
                
                if max_refuel is not None and new_refuel > max_refuel:
                    continue
                
                new_state = (next_pos, new_mask, new_fuel, new_load, new_refuel)
                new_g = cost_func(g_cost, distance, is_refuel)
                new_f = new_g + self.problem.heuristic(next_pos, new_mask)
                
                if not self._is_dominated(new_state, new_g, labels, is_phase_refuel):
                    self._add_label(new_state, new_g, labels, is_phase_refuel)
                    heapq.heappush(pq, (new_f, new_g, new_state))
                    prev[new_state] = (state, action, distance)
        
        self.stats['labels'] = label_count
        return target_found, prev
    
    def _cost_refuel(self, current_cost, distance, is_refuel):
        """Cost function: count refuel events"""
        return current_cost + (1 if is_refuel else 0)
    
    def _cost_distance(self, current_cost, distance, is_refuel):
        """Cost function: sum distance traveled"""
        return current_cost + distance
    
    def _reconstruct_path(self, end_state, prev):
        """Reconstruct path from final state to initial state"""
        path = []
        current = end_state
        total_dist = 0
        
        while current in prev:
            prev_state, action, distance = prev[current]
            pos = current[0]
            point = self.problem.points[pos]
            path.append((point, action, distance))
            total_dist += distance
            current = prev_state
        
        path.append((self.problem.points[0], "START", 0))
        path.reverse()
        
        refuel = end_state[4]
        print(f"Total distance: {total_dist:.1f} ô | Total refuel: {refuel}")
        
        return path


def create_grid_with_obstacles(width: int, height: int, obstacle_density: float = 0.1, 
                               protected_points: Optional[List[Tuple[int, int]]] = None) -> Grid:
    """Generate grid with random obstacles, avoiding protected points"""
    obstacles = set()
    protected_zone = set()
    
    if protected_points:
        for px, py in protected_points:
            for dx in range(-2, 3):
                for dy in range(-2, 3):
                    nx, ny = px + dx, py + dy
                    if 0 <= nx < width and 0 <= ny < height:
                        protected_zone.add((nx, ny))
    
    num_obstacles = int(width * height * obstacle_density)
    attempts = 0
    max_attempts = num_obstacles * 3
    
    while len(obstacles) < num_obstacles and attempts < max_attempts:
        x = random.randint(0, width - 1)
        y = random.randint(0, height - 1)
        if (x, y) not in protected_zone:
            obstacles.add((x, y))
        attempts += 1
    
    return Grid(width, height, obstacles)


def visualize_static(problem: DeliveryProblem, path: List):
    """Display static visualization of delivery route"""
    route = [p[0] for p in path]
    
    fig, ax = plt.subplots(figsize=(12, 12))
    
    for (x, y) in problem.grid.obstacles:
        ax.plot(x, y, 's', color='gray', markersize=4, alpha=0.5)
    
    ax.plot([p[0] for p in route], [p[1] for p in route], 'b-o', linewidth=2, markersize=8)
    
    ax.scatter(problem.start[0], problem.start[1], c='green', s=200, marker='o', 
              edgecolors='black', linewidth=2, label='Depot', zorder=5)
    
    for i, order in enumerate(problem.orders):
        ax.scatter(order['p'][0], order['p'][1], c='orange', s=120, marker='^',
                  edgecolors='black', linewidth=1.5, zorder=4)
        ax.text(order['p'][0] + 0.5, order['p'][1] + 0.5, f'P{i+1}', fontsize=10)
        
        ax.scatter(order['d'][0], order['d'][1], c='red', s=120, marker='v',
                  edgecolors='black', linewidth=1.5, zorder=4)
        ax.text(order['d'][0] + 0.5, order['d'][1] + 0.5, f'D{i+1}', fontsize=10)
    
    for i, gas in enumerate(problem.gas_stations):
        ax.scatter(gas[0], gas[1], c='purple', s=140, marker='s',
                  edgecolors='black', linewidth=1.5, zorder=4)
        ax.text(gas[0] + 0.5, gas[1] + 0.5, f'G{i+1}', fontsize=9)
    
    all_x = [p[0] for p in route]
    all_y = [p[1] for p in route]
    ax.set_xlim(min(all_x) - 2, max(all_x) + 2)
    ax.set_ylim(min(all_y) - 2, max(all_y) + 2)
    
    ax.grid(True, linestyle='--', alpha=0.3)
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    ax.set_title('Delivery Route with Obstacles')
    ax.legend()
    ax.set_aspect('equal')
    
    plt.tight_layout()
    plt.show()


def visualize_animated(problem: DeliveryProblem, path: List):
    """Display animated visualization of delivery route"""
    route = [p[0] for p in path]
    actions = [p[1] for p in path]
    
    fig, ax = plt.subplots(figsize=(12, 12))
    
    for (x, y) in problem.grid.obstacles:
        ax.plot(x, y, 's', color='gray', markersize=4, alpha=0.5)
    
    ax.grid(True, linestyle='--', alpha=0.3)
    
    all_x = [p[0] for p in route]
    all_y = [p[1] for p in route]
    ax.set_xlim(min(all_x) - 2, max(all_x) + 2)
    ax.set_ylim(min(all_y) - 2, max(all_y) + 2)
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    ax.set_title('Delivery Route Animation')
    
    ax.scatter(problem.start[0], problem.start[1], c='green', s=200, marker='o',
              edgecolors='black', linewidth=2, zorder=5)
    
    for i, order in enumerate(problem.orders):
        ax.scatter(order['p'][0], order['p'][1], c='orange', s=120, marker='^',
                  edgecolors='black', linewidth=1.5, zorder=4)
        ax.text(order['p'][0] + 0.5, order['p'][1] + 0.5, f'P{i+1}', fontsize=9)
        
        ax.scatter(order['d'][0], order['d'][1], c='red', s=120, marker='v',
                  edgecolors='black', linewidth=1.5, zorder=4)
        ax.text(order['d'][0] + 0.5, order['d'][1] + 0.5, f'D{i+1}', fontsize=9)
    
    for gas in problem.gas_stations:
        ax.scatter(gas[0], gas[1], c='purple', s=140, marker='s',
                  edgecolors='black', linewidth=1.5, zorder=4)
    
    line, = ax.plot([], [], 'b-o', linewidth=2, markersize=8)
    text_box = ax.text(0.02, 0.98, '', transform=ax.transAxes, fontsize=11,
                      verticalalignment='top', bbox=dict(boxstyle='round', 
                      facecolor='wheat', alpha=0.8))
    
    def init():
        line.set_data([], [])
        text_box.set_text('')
        return line, text_box
    
    def animate(frame):
        current_route_x = [route[i][0] for i in range(min(frame + 1, len(route)))]
        current_route_y = [route[i][1] for i in range(min(frame + 1, len(route)))]
        line.set_data(current_route_x, current_route_y)
        
        action = actions[frame] if frame < len(actions) else "Complete"
        text = f"Step {frame}: {action}\nPosition: {route[frame]}"
        text_box.set_text(text)
        
        return line, text_box
    
    anim = FuncAnimation(fig, animate, init_func=init, frames=len(route),
                        interval=500, blit=True, repeat=True)
    
    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    random.seed(42)
    
    start = (2, 3)
    orders = [
        {'p': (8, 8), 'd': (20, 20), 'w': 20},
        {'p': (5, 18), 'd': (15, 5), 'w': 15},
        {'p': (20, 10), 'd': (25, 25), 'w': 10},
    ]
    gas_stations = [(12, 12), (25, 3)]
    
    protected_points = [start] + [o['p'] for o in orders] + [o['d'] for o in orders] + gas_stations
    
    print("=== Creating problem with obstacles ===")
    grid = None
    problem = None
    max_attempts = 20
    attempt = 0
    
    while problem is None and attempt < max_attempts:
        try:
            grid = create_grid_with_obstacles(width=100, height=100, obstacle_density=0.1, 
                                            protected_points=protected_points)
            
            problem = DeliveryProblem(
                start=start,
                orders=orders,
                gas_stations=gas_stations,
                max_weight=50,
                max_fuel=100,
                grid=grid
            )
            print(f"✓ Problem created on attempt {attempt + 1}")
        except ValueError as e:
            print(f"✗ Attempt {attempt + 1}: {e}")
            problem = None
            attempt += 1
    
    if problem is None:
        print(f"Failed after {max_attempts} attempts. Creating grid without obstacles...")
        empty_grid = Grid(100, 100, set())
        problem = DeliveryProblem(
            start=start,
            orders=orders,
            gas_stations=gas_stations,
            max_weight=50,
            max_fuel=100,
            grid=empty_grid
        )
        print("✓ Created problem with empty grid")
    
    print(f"\nGrid: {problem.grid.width}x{problem.grid.height} | Obstacles: {len(problem.grid.obstacles)}")
    print(f"Fuel capacity: {problem.max_fuel_units} units")
    
    print("\nDistance matrix:")
    for i, p1 in enumerate(problem.points):
        row = []
        for j, p2 in enumerate(problem.points):
            d = problem.dist[i][j]
            if d == float('inf'):
                row.append("INF")
            else:
                row.append(f"{int(d):3d}")
        print(f"{i}: {str(p1):12} → {' '.join(row)}")
    
    optimizer = Optimizer(problem)
    path = optimizer.optimize(criterion='refuel')
    
    if path:
        print("\n✓✓✓ SOLUTION FOUND ✓✓✓")
        print("\nRoute details:")
        for i, (pt, act, dist) in enumerate(path):
            print(f"{i:2d}: {str(pt):>12} → {act:20} (+{dist:.1f} ô)")
        
        print("\n[1] Static visualization")
        visualize_static(problem, path)
        
        print("\n[2] Animated visualization")
        visualize_animated(problem, path)
    else:
        print("\nNO SOLUTION FOUND")